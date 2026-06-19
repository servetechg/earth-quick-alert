import 'server-only';

import { cacheDelByPrefix, cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store';
import { recordStaleServed } from '@/lib/cache/cache-metrics';

type SwrEntry<T> = { value: T; freshUntil: number; staleUntil: number };

const inflight = new Map<string, Promise<unknown>>();

export interface SwrOptions {
    ttlMs?: number;
    staleMs?: number;
    force?: boolean;
}

/**
 * Shared stale-while-revalidate cache (Redis + in-memory fallback).
 * Same semantics as the original risk-report-cache Map implementation.
 */
export async function getOrRevalidate<T>(
    key: string,
    producer: () => Promise<T>,
    opts: SwrOptions = {},
): Promise<T> {
    const ttlMs = opts.ttlMs ?? 90_000;
    const staleMs = opts.staleMs ?? 600_000;
    const now = Date.now();
    const storeKey = `swr:${key}`;

    const hit = await cacheGetJson<SwrEntry<T>>(storeKey);

    if (!opts.force && hit && now < hit.freshUntil) {
        return hit.value;
    }

    const refresh = (): Promise<T> => {
        if (inflight.has(storeKey)) return inflight.get(storeKey) as Promise<T>;
        const p = (async () => {
            try {
                const value = await producer();
                const entry: SwrEntry<T> = {
                    value,
                    freshUntil: Date.now() + ttlMs,
                    staleUntil: Date.now() + ttlMs + staleMs,
                };
                await cacheSetJson(storeKey, entry, ttlMs + staleMs);
                return value;
            } finally {
                inflight.delete(storeKey);
            }
        })();
        inflight.set(storeKey, p);
        return p;
    };

    if (!opts.force && hit && now < hit.staleUntil) {
        recordStaleServed();
        void refresh().catch((e) => console.error('[swr-cache] bg refresh', key, e));
        return hit.value;
    }

    return refresh();
}

export async function invalidateCachePrefix(prefix: string): Promise<void> {
    await cacheDelByPrefix(`swr:${prefix}`);
    for (const k of inflight.keys()) {
        if (k.startsWith(`swr:${prefix}`)) inflight.delete(k);
    }
}

/** @deprecated use invalidateCachePrefix */
export async function invalidate(prefix: string): Promise<void> {
    await invalidateCachePrefix(prefix);
}
