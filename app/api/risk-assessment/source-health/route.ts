import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import {
    probeSourceHealth,
    probeSingleSource,
    LIVE_INPUT_KEYS,
    type LiveInputKey,
    type SourceHealth,
} from '@/lib/services/risk-source-health';
import { resolveDemoSessionContext } from '@/lib/demo/provider';

export const maxDuration = 30;

type SwrEntry<T> = { value: T; freshUntil: number; staleUntil: number };

/** Shorter TTL when a probe fails so transient timeouts don't stay red for minutes. */
async function getCachedProbe(
    cacheKey: string,
    probe: () => Promise<SourceHealth>,
    force = false,
): Promise<SourceHealth> {
    const storeKey = `swr:${cacheKey}`;
    const now = Date.now();
    const hit = force ? null : await cacheGetJson<SwrEntry<SourceHealth>>(storeKey);

    if (hit && now < hit.freshUntil) {
        return hit.value;
    }

    const value = await probe();
    const ttlMs = value.ok ? 120_000 : 30_000;
    const staleMs = value.ok ? 300_000 : 60_000;
    const entry: SwrEntry<SourceHealth> = {
        value,
        freshUntil: now + ttlMs,
        staleUntil: now + ttlMs + staleMs,
    };
    await cacheSetJson(storeKey, entry, ttlMs + staleMs);
    return value;
}

async function getCachedBulkProbe(force = false): Promise<SourceHealth[]> {
    const storeKey = 'swr:source-health:v1';
    const now = Date.now();
    const hit = force ? null : await cacheGetJson<SwrEntry<SourceHealth[]>>(storeKey);

    if (hit && now < hit.freshUntil) {
        return hit.value;
    }

    const value = await probeSourceHealth();
    const allOk = value.every((s) => s.ok);
    const ttlMs = allOk ? 60_000 : 30_000;
    const staleMs = allOk ? 120_000 : 60_000;
    const entry: SwrEntry<SourceHealth[]> = {
        value,
        freshUntil: now + ttlMs,
        staleUntil: now + ttlMs + staleMs,
    };
    await cacheSetJson(storeKey, entry, ttlMs + staleMs);
    return value;
}

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
        const force = url.searchParams.get('refresh') === '1';

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );

        // Per-key probe (legacy): SWR-cached with shorter TTL on failures.
        if (keyParam && (LIVE_INPUT_KEYS as readonly string[]).includes(keyParam)) {
            if (demoCtx) {
                return NextResponse.json({ sources: [{ key: keyParam, ok: true }] });
            }
            const result = await getCachedProbe(
                `source-health:key:${keyParam}`,
                () => probeSingleSource(keyParam),
                force,
            );
            return NextResponse.json({ sources: [result] });
        }

        // Bulk probe: one serverless invocation, all 5 feeds in parallel.
        if (demoCtx) {
            const sources: SourceHealth[] = LIVE_INPUT_KEYS.map((key) => ({ key, ok: true }));
            return NextResponse.json({ sources });
        }

        const sources = await getCachedBulkProbe(force);

        return NextResponse.json({ sources });
    } catch (e: any) {
        console.error('risk-assessment/source-health:', e);
        return NextResponse.json(
            { error: 'Failed to probe source health', message: e?.message },
            { status: 500 },
        );
    }
}
