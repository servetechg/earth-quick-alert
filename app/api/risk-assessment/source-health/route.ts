import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getOrRevalidate } from '@/lib/services/risk-report-cache';
import { probeSourceHealth, LIVE_INPUT_KEYS, type SourceHealth } from '@/lib/services/risk-source-health';
import { resolveDemoSessionContext } from '@/lib/demo/provider';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

export async function GET() {
    try {
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );
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
