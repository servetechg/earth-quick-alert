import 'server-only';

import {
    recordCacheHit,
    recordCacheMiss,
    recordMemoryFallback,
    recordRedisError,
} from '@/lib/cache/cache-metrics';
import { parseCachedJson, serializeCachedJson } from '@/lib/cache/json-codec';

type MemoryEntry = { value: string; expiresAt: number };

const memoryStore = new Map<string, MemoryEntry>();

async function redisModule() {
    return import('@/lib/cache/redis-backend');
}

function fullKey(key: string, prefix: string): string {
    return key.startsWith(prefix) ? key : `${prefix}${key}`;
}

function memoryGet(key: string): string | null {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        memoryStore.delete(key);
        return null;
    }
    return entry.value;
}

function memorySet(key: string, value: string, ttlMs: number): void {
    memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function memoryDelByPrefix(prefix: string): void {
    for (const k of memoryStore.keys()) {
        if (k.startsWith(prefix)) memoryStore.delete(k);
    }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
    const { cacheKeyPrefix, getRedisBackend } = await redisModule();
    const prefix = cacheKeyPrefix();
    const fk = fullKey(key, prefix);

    try {
        const redis = await getRedisBackend();
        if (redis) {
            const raw = await redis.get(fk);
            if (raw !== null && raw !== undefined) {
                recordCacheHit();
                return parseCachedJson<T>(raw);
            }
        }
    } catch (err) {
        recordRedisError();
        console.warn('[cache] redis get failed:', err instanceof Error ? err.message : err);
    }

    const mem = memoryGet(fk);
    if (mem) {
        recordCacheHit();
        recordMemoryFallback();
        return parseCachedJson<T>(mem);
    }

    recordCacheMiss();
    return null;
}

export async function cacheSetJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    const { cacheKeyPrefix, getRedisBackend } = await redisModule();
    const prefix = cacheKeyPrefix();
    const fk = fullKey(key, prefix);
    const serialized = serializeCachedJson(value);
    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));

    memorySet(fk, serialized, ttlMs);

    try {
        const redis = await getRedisBackend();
        if (redis) {
            await redis.set(fk, serialized, ttlSec);
        }
    } catch (err) {
        recordRedisError();
        console.warn('[cache] redis set failed:', err instanceof Error ? err.message : err);
    }
}

export async function cacheDelByPrefix(prefix: string): Promise<void> {
    const { cacheKeyPrefix, getRedisBackend } = await redisModule();
    const fk = fullKey(prefix, cacheKeyPrefix());
    memoryDelByPrefix(fk);

    try {
        const redis = await getRedisBackend();
        if (!redis) return;
        await redis.scanAndDel(`${fk}*`);
    } catch (err) {
        recordRedisError();
        console.warn('[cache] redis del failed:', err instanceof Error ? err.message : err);
    }
}
