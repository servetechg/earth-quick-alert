import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOrRevalidate } from '@/lib/services/risk-report-cache';
import {
    probeSourceHealth,
    probeSingleSource,
    LIVE_INPUT_KEYS,
    type LiveInputKey,
    type SourceHealth,
} from '@/lib/services/risk-source-health';
import { resolveDemoSessionContext } from '@/lib/demo/provider';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

export async function GET(req: Request) {
    try {
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const keyParam = url.searchParams.get('key') as LiveInputKey | null;

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );

        // Per-key probe: SWR-cached so reloads don't block on 5× sequential timeouts.
        if (keyParam && (LIVE_INPUT_KEYS as readonly string[]).includes(keyParam)) {
            if (demoCtx) {
                return NextResponse.json({ sources: [{ key: keyParam, ok: true }] });
            }
            const result = await getOrRevalidate(
                `source-health:key:${keyParam}`,
                () => probeSingleSource(keyParam),
                { ttlMs: 120_000, staleMs: 300_000 },
            );
            return NextResponse.json({ sources: [result] });
        }

        // Bulk probe (legacy path): SWR-cached, all 5 at once.
        if (demoCtx) {
            const sources: SourceHealth[] = LIVE_INPUT_KEYS.map((key) => ({ key, ok: true }));
            return NextResponse.json({ sources });
        }

        const sources = await getOrRevalidate(
            'source-health:v1',
            () => probeSourceHealth(),
            { ttlMs: 60_000, staleMs: 120_000 },
        );

        return NextResponse.json({ sources });
    } catch (e: any) {
        console.error('risk-assessment/source-health:', e);
        return NextResponse.json(
            { error: 'Failed to probe source health', message: e?.message },
            { status: 500 },
        );
    }
}
