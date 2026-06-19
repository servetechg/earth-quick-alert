type CacheMetrics = {
    hits: number;
    misses: number;
    staleServed: number;
    redisErrors: number;
    memoryFallback: number;
};

const globalKey = '__eqa_cache_metrics__' as const;

function metrics(): CacheMetrics {
    const g = globalThis as typeof globalThis & { [globalKey]?: CacheMetrics };
    if (!g[globalKey]) {
        g[globalKey] = { hits: 0, misses: 0, staleServed: 0, redisErrors: 0, memoryFallback: 0 };
    }
    return g[globalKey]!;
}

export function recordCacheHit(): void {
    metrics().hits++;
}

export function recordCacheMiss(): void {
    metrics().misses++;
}

export function recordStaleServed(): void {
    metrics().staleServed++;
}

export function recordRedisError(): void {
    metrics().redisErrors++;
}

export function recordMemoryFallback(): void {
    metrics().memoryFallback++;
}

export function getCacheMetrics(): CacheMetrics {
    return { ...metrics() };
}

export function resetCacheMetrics(): void {
    const g = globalThis as typeof globalThis & { [globalKey]?: CacheMetrics };
    g[globalKey] = { hits: 0, misses: 0, staleServed: 0, redisErrors: 0, memoryFallback: 0 };
}
