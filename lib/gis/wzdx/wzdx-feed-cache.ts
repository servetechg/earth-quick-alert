import type { RoadClosureSegment } from '@/lib/gis/road-closure-types'

/** WZDX feed payloads are large — keep warm in Redis across requests. */
export const WZDX_FEED_CACHE_TTL_MS = 10 * 60 * 1000
export const WZDX_STATE_CACHE_TTL_MS = 10 * 60 * 1000

export function wzdxFeedCacheKey(feedId: string): string {
    return `map-layer:wzdx:feed:${feedId.toUpperCase()}`
}

export function wzdxStateCacheKey(stateCode: string): string {
    return `map-layer:wzdx:state:${stateCode.toUpperCase()}`
}

type MemoryEntry = { value: RoadClosureSegment[]; expiresAt: number }
const memoryFeeds = new Map<string, MemoryEntry>()
const memoryStates = new Map<string, MemoryEntry>()

function memoryGet(store: Map<string, MemoryEntry>, key: string): RoadClosureSegment[] | null {
    const hit = store.get(key)
    if (!hit || hit.expiresAt <= Date.now()) {
        store.delete(key)
        return null
    }
    return hit.value
}

function memorySet(
    store: Map<string, MemoryEntry>,
    key: string,
    value: RoadClosureSegment[],
    ttlMs: number,
): void {
    store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

async function redisGet(key: string): Promise<RoadClosureSegment[] | null> {
    try {
        const { cacheGetJson } = await import('@/lib/cache/cache-store')
        return cacheGetJson<RoadClosureSegment[]>(key)
    } catch {
        return null
    }
}

async function redisSet(key: string, value: RoadClosureSegment[], ttlMs: number): Promise<void> {
    try {
        const { cacheSetJson } = await import('@/lib/cache/cache-store')
        await cacheSetJson(key, value, ttlMs)
    } catch {
        // Redis unavailable — memory fallback only
    }
}

export async function getCachedWzdxSegments(key: string): Promise<RoadClosureSegment[] | null> {
    const redisHit = await redisGet(key)
    if (redisHit) {
        memorySet(
            key.startsWith('map-layer:wzdx:state:') ? memoryStates : memoryFeeds,
            key,
            redisHit,
            WZDX_STATE_CACHE_TTL_MS,
        )
        return redisHit
    }

    const memStore = key.startsWith('map-layer:wzdx:state:') ? memoryStates : memoryFeeds
    return memoryGet(memStore, key)
}

export async function setCachedWzdxSegments(
    key: string,
    value: RoadClosureSegment[],
    ttlMs: number,
): Promise<void> {
    const memStore = key.startsWith('map-layer:wzdx:state:') ? memoryStates : memoryFeeds
    memorySet(memStore, key, value, ttlMs)
    await redisSet(key, value, ttlMs)
}
