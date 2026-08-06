import { getUsStateBbox } from '@/lib/constants/us-state-bounding-boxes'
import {
    boundsFromStateCode,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import type { RoadClosureSegment } from '@/lib/gis/road-closure-types'
import {
    resolveWzdxFeedUrl,
    WZDX_IMPLEMENTED_STATE_CODES,
    wzdxFeedsForState,
    type WzdxFeedConfig,
} from '@/lib/gis/wzdx/wzdx-feed-config'
import { parseWzdxFeatureCollection } from '@/lib/gis/wzdx/wzdx-parser'
import {
    getCachedWzdxSegments,
    setCachedWzdxSegments,
    WZDX_FEED_CACHE_TTL_MS,
    WZDX_STATE_CACHE_TTL_MS,
    wzdxFeedCacheKey,
    wzdxStateCacheKey,
} from '@/lib/gis/wzdx/wzdx-feed-cache'

const FEED_FETCH_TIMEOUT_MS = 6_000

function wzdxHeaders(feed: WzdxFeedConfig): HeadersInit {
    const headers: Record<string, string> = {
        Accept: 'application/json, application/geo+json',
        'User-Agent':
            process.env.NWS_USER_AGENT?.trim() ||
            'ready2go-emergency-dashboard (wzdx-road-closures)',
    }
    if (feed.acceptCompressed) {
        headers['Accept-Encoding'] = 'gzip, deflate, br'
    }
    return headers
}

function scopeToBounds(scope: InfrastructureSearchScope): MapBounds | null {
    if (scope.mode === 'state') return boundsFromStateCode(scope.stateCode)
    if (scope.mode === 'bounds') return scope.bounds
    if (scope.mode === 'radius') {
        const latDelta = scope.radiusMile / 69
        const cosLat = Math.cos((scope.center.lat * Math.PI) / 180)
        const lngDelta = scope.radiusMile / (69 * Math.max(0.2, Math.abs(cosLat)))
        return {
            south: scope.center.lat - latDelta,
            north: scope.center.lat + latDelta,
            west: scope.center.lng - lngDelta,
            east: scope.center.lng + lngDelta,
        }
    }
    return null
}

function stateBboxIntersectsBounds(stateCode: string, bounds: MapBounds): boolean {
    const bbox = getUsStateBbox(stateCode)
    if (!bbox) return false
    const [west, south, east, north] = bbox
    return !(bounds.east < west || bounds.west > east || bounds.north < south || bounds.south > north)
}

/** States whose WZDX feeds should load for this search scope. */
export function wzdxStateCodesForScope(scope: InfrastructureSearchScope): string[] {
    if (scope.mode === 'state') {
        return [scope.stateCode.toUpperCase()]
    }

    const bounds = scopeToBounds(scope)
    if (!bounds) return []

    return WZDX_IMPLEMENTED_STATE_CODES.filter((code) => stateBboxIntersectsBounds(code, bounds))
}

function parseWzdxPayload(text: string): { features?: unknown } | null {
    try {
        let data: unknown = JSON.parse(text)
        if (typeof data === 'string') {
            data = JSON.parse(data)
        }
        if (!data || typeof data !== 'object') return null
        return data as { features?: unknown }
    } catch {
        return null
    }
}

async function fetchWzdxFeedSegments(feed: WzdxFeedConfig): Promise<RoadClosureSegment[]> {
    const cacheKey = wzdxFeedCacheKey(feed.feedId)
    const cached = await getCachedWzdxSegments(cacheKey)
    if (cached) return cached

    const url = resolveWzdxFeedUrl(feed)
    if (!url) {
        console.warn(
            `[wzdx] Skipping ${feed.feedId}: missing URL or API key (${feed.apiKeyEnv ?? 'none'})`,
        )
        return []
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS)

    try {
        const res = await fetch(url, {
            headers: wzdxHeaders(feed),
            redirect: 'follow',
            signal: controller.signal,
        })
        if (!res.ok) {
            console.warn(`[wzdx] ${feed.feedId} HTTP ${res.status}`)
            return []
        }

        const text = await res.text()
        const payload = parseWzdxPayload(text)
        if (!payload) {
            console.warn(`[wzdx] ${feed.feedId} response is not valid JSON`)
            return []
        }

        if (!Array.isArray(payload.features)) {
            console.warn(`[wzdx] ${feed.feedId} missing features array`)
            return []
        }

        const segments = parseWzdxFeatureCollection(payload, feed)
        await setCachedWzdxSegments(cacheKey, segments, WZDX_FEED_CACHE_TTL_MS)
        return segments
    } catch (err) {
        console.warn(`[wzdx] ${feed.feedId} fetch failed:`, err)
        return []
    } finally {
        clearTimeout(timer)
    }
}

async function fetchWzdxForState(stateCode: string): Promise<RoadClosureSegment[]> {
    const usps = stateCode.toUpperCase()
    const cacheKey = wzdxStateCacheKey(usps)
    const cached = await getCachedWzdxSegments(cacheKey)
    if (cached) return cached

    const feeds = wzdxFeedsForState(usps)
    if (feeds.length === 0) return []

    const batches = await Promise.all(feeds.map((feed) => fetchWzdxFeedSegments(feed)))
    const out: RoadClosureSegment[] = []
    const seen = new Set<string>()

    for (const batch of batches) {
        for (const segment of batch) {
            if (seen.has(segment.id)) continue
            seen.add(segment.id)
            out.push(segment)
        }
    }

    await setCachedWzdxSegments(cacheKey, out, WZDX_STATE_CACHE_TTL_MS)
    return out
}

export async function fetchWzdxClosures(scope: InfrastructureSearchScope): Promise<RoadClosureSegment[]> {
    const stateCodes = wzdxStateCodesForScope(scope)
    if (stateCodes.length === 0) return []

    const batches = await Promise.all(stateCodes.map((code) => fetchWzdxForState(code)))
    const out: RoadClosureSegment[] = []
    const seen = new Set<string>()

    for (const batch of batches) {
        for (const segment of batch) {
            if (seen.has(segment.id)) continue
            seen.add(segment.id)
            out.push(segment)
        }
    }

    return out
}
