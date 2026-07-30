import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store'
import type { InfrastructureSearchScope } from '@/lib/gis/infrastructure-search-grid'
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'
import { calculateDistance } from '@/lib/services/mock-map-service'
import type { RoadClosureSegment } from '@/lib/gis/road-closure-types'
import { wzdxSegmentLooksLikeGenuineClosure } from '@/lib/gis/road511/road511-filters'
import { densifyPathAlongRoads } from '@/lib/gis/road-path-follow'
import { fetchRoad511Closures } from '@/lib/gis/road511/road511-road-closures'

/**
 * Real-time **full road closures only** via Road511 (official 511 / DOT / WZDx).
 *
 * Replaces TomTom Incident Details. Strict client-side filters drop accidents,
 * disabled/stalled vehicles, partial lane work, and inactive permit noise.
 */
const CACHE_TTL_MS = 10 * 60 * 1000
/** Short TTL for empty results so a transient miss never sticks for 10 minutes. */
const EMPTY_CACHE_TTL_MS = 60 * 1000
/** Bump when provider/fallback rules change. */
const ROAD_CLOSURE_PREFIX = 'map-layer:road-closures:v10:'

function scopeCacheKey(scope: InfrastructureSearchScope): string {
    if (scope.mode === 'state') return `state:${scope.stateCode.toUpperCase()}`
    if (scope.mode === 'radius') {
        return `radius:${scope.center.lat.toFixed(3)},${scope.center.lng.toFixed(3)}:${scope.radiusMile}`
    }
    const b = scope.bounds
    return `bounds:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}`
}

function pointInScope(lat: number, lng: number, scope: InfrastructureSearchScope): boolean {
    if (scope.mode === 'state') return pointInUsStateBBox(lng, lat, scope.stateCode)
    if (scope.mode === 'radius') {
        return (
            calculateDistance(lat, lng, scope.center.lat, scope.center.lng) <= scope.radiusMile
        )
    }
    const b = scope.bounds
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north
}

function pathIntersectsScope(
    path: { lat: number; lng: number }[],
    scope: InfrastructureSearchScope,
): boolean {
    return path.some((p) => pointInScope(p.lat, p.lng, scope))
}

function isFullRoadClosure(segment: RoadClosureSegment): boolean {
    return segment.status === 'Closed'
}

export async function fetchRoadClosures(
    scope: InfrastructureSearchScope,
): Promise<{
    closures: RoadClosureSegment[]
    sources: string[]
    fetchedAt: string
    warning?: string
}> {
    const sources: string[] = []
    const byId = new Map<string, RoadClosureSegment>()
    let warning: string | undefined

    const cacheKey = `${ROAD_CLOSURE_PREFIX}${scopeCacheKey(scope)}`
    const cached = await cacheGetJson<
        | RoadClosureSegment[]
        | { closures: RoadClosureSegment[]; sources: string[]; warning?: string }
    >(cacheKey)
    if (cached) {
        if (Array.isArray(cached)) {
            return {
                closures: cached,
                sources: ['cached'],
                fetchedAt: new Date().toISOString(),
            }
        }
        if (Array.isArray(cached.closures)) {
            return {
                closures: cached.closures,
                sources: cached.sources?.length ? cached.sources : ['cached'],
                fetchedAt: new Date().toISOString(),
                warning: cached.warning,
            }
        }
    }

    const road511 = await fetchRoad511Closures(scope)
    let providerOk = false
    let providerStatus: number | null = road511.httpStatus

    if (road511.ok) {
        providerOk = true
        for (const segment of road511.closures) {
            if (!pathIntersectsScope(segment.path, scope)) continue
            if (!byId.has(segment.id)) byId.set(segment.id, segment)
        }
        if (road511.closures.length > 0 || byId.size > 0) {
            sources.push('Road511')
        } else if (!sources.includes('Road511')) {
            // Successful empty response still attributes the provider.
            sources.push('Road511')
        }
    } else if (road511.warning) {
        warning = road511.warning
    }

    // DOT WZDX fallback — only when Road511 is unavailable; same genuine-closure gate.
    if (!providerOk) {
        try {
            const { fetchWzdxClosures } = await import('@/lib/gis/wzdx/wzdx-road-closures')
            const wzdx = await fetchWzdxClosures(scope)
            let added = 0
            for (const segment of wzdx) {
                if (!isFullRoadClosure(segment)) continue
                if (!wzdxSegmentLooksLikeGenuineClosure(segment.reason)) continue
                const path = await densifyPathAlongRoads(segment.path, {
                    roadName: segment.roadName,
                    reason: segment.reason,
                })
                const densified = { ...segment, path }
                if (!pathIntersectsScope(densified.path, scope)) continue
                if (byId.has(densified.id)) continue
                byId.set(densified.id, densified)
                added += 1
            }
            if (added > 0) {
                if (!sources.includes('WZDX (DOT)')) sources.push('WZDX (DOT)')
                warning = undefined
            } else {
                warning = [
                    warning,
                    'No WZDX full closures matched genuine-closure filters in this view.',
                ]
                    .filter(Boolean)
                    .join(' ')
            }
        } catch (err) {
            console.warn('[road-closures] WZDX fallback failed:', err)
            warning = [warning, 'WZDX fallback also failed.'].filter(Boolean).join(' ')
        }
    }

    const closures = [...byId.values()]
    if (sources.length === 0) sources.push('none')

    const ttl =
        closures.length > 0
            ? CACHE_TTL_MS
            : providerStatus === 401 || providerStatus === 403
              ? 30_000
              : EMPTY_CACHE_TTL_MS

    await cacheSetJson(cacheKey, { closures, sources, warning }, ttl)

    return {
        closures,
        sources,
        fetchedAt: new Date().toISOString(),
        warning,
    }
}
