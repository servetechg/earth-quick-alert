import {
    boundsFromStateCode,
    intersectBounds,
    PLACES_SEARCH_RADIUS_M,
    radiusSearchPlan,
    stateSearchPlan,
    viewportSearchPlan,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import { placeMatchesRequestedType, placeMatchesShelter } from '@/lib/gis/infrastructure-place-filter'
import type { GisFilterLayerDef } from '@/lib/gis/gis-filter-layers'
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config'
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'
import { calculateDistance } from '@/lib/services/mock-map-service'
import type { CachedInfrastructurePlace } from '@/models/InfrastructurePlaceGridCache'
import {
    loadGridCellFromCache,
    saveGridCellToCache,
} from '@/lib/gis/infrastructure-grid-cache'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store'
import { rankPlacesForViewport } from '@/lib/gis/viewport-place-ranking'

export type InfrastructurePlaceResult = {
    place_id: string
    name: string
    placeType: string
    lat: number
    lng: number
    vicinity: string
    rating?: number
    user_ratings_total?: number
}

const FETCH_CONCURRENCY = 10
const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000
const NEXT_PAGE_DELAY_MS = 2100
const MAX_PLACES_PAGES = 3

type RawPlace = {
    place_id?: string
    name?: string
    types?: string[]
    business_status?: string
    rating?: number
    user_ratings_total?: number
    geometry?: { location?: { lat?: number; lng?: number } }
    vicinity?: string
    formatted_address?: string
}

type SearchPlan = {
    points: { lat: number; lng: number }[]
    radiusM: number
    comprehensive: boolean
}

type FetchCellRequest = {
    layer: GisFilterLayerDef
    center: { lat: number; lng: number }
    radiusM: number
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function roundGridCoord(value: number) {
    return Math.round(value * 10_000) / 10_000
}

function scopeCacheKey(scope: InfrastructureSearchScope): string {
    if (scope.mode === 'state') return `state:${scope.stateCode.toUpperCase()}`
    if (scope.mode === 'radius') {
        return `radius:${scope.center.lat.toFixed(4)},${scope.center.lng.toFixed(4)}:${scope.radiusMile}`
    }
    const b = scope.bounds
    return `bounds:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}`
}

function cellCacheTypeKey(layer: GisFilterLayerDef): string {
    if (layer.fetch.mode === 'google_nearby') return layer.fetch.placeType
    if (layer.fetch.mode === 'google_text') return `text:${layer.resultType}`
    if (layer.fetch.mode === 'google_composite') return `composite:${layer.fetch.placeType}`
    return layer.resultType
}

function requestedTypeForLayer(layer: GisFilterLayerDef): string {
    if (layer.fetch.mode === 'google_nearby') return layer.fetch.placeType
    if (layer.fetch.mode === 'google_composite') return layer.fetch.placeType
    return layer.resultType
}

async function fetchRawPlacesForLayer(
    layer: GisFilterLayerDef,
    center: { lat: number; lng: number },
    radiusM: number,
): Promise<RawPlace[]> {
    if (layer.fetch.mode === 'google_text') {
        return textSearchAllPages(layer.fetch.query, center.lat, center.lng, radiusM)
    }

    if (layer.fetch.mode === 'google_composite') {
        const [nearby, text, ...extraNearby] = await Promise.all([
            nearbySearchAllPages(center.lat, center.lng, layer.fetch.placeType, radiusM),
            textSearchAllPages(layer.fetch.textQuery, center.lat, center.lng, radiusM),
            ...(layer.fetch.extraNearbyTypes ?? []).map((type) =>
                nearbySearchAllPages(center.lat, center.lng, type, radiusM),
            ),
        ])
        const byId = new Map<string, RawPlace>()
        for (const place of [...nearby, ...text, ...extraNearby.flat()]) {
            if (place.place_id) byId.set(place.place_id, place)
        }
        return [...byId.values()]
    }

    return nearbySearchAllPages(center.lat, center.lng, layer.fetch.placeType, radiusM)
}

async function nearbySearchAllPages(
    lat: number,
    lng: number,
    type: string,
    radiusM: number,
): Promise<RawPlace[]> {
    if (!GOOGLE_MAPS_API_KEY) return []

    const collected: RawPlace[] = []
    let pageToken: string | undefined

    for (let page = 0; page < MAX_PLACES_PAGES; page++) {
        const params = new URLSearchParams({
            location: `${lat},${lng}`,
            radius: String(radiusM),
            type,
            key: GOOGLE_MAPS_API_KEY,
        })
        if (pageToken) params.set('pagetoken', pageToken)

        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
        const res = await fetch(url)
        if (!res.ok) break

        const data = (await res.json()) as {
            status?: string
            results?: RawPlace[]
            next_page_token?: string
        }

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            if (data.status === 'INVALID_REQUEST' && pageToken) {
                await sleep(NEXT_PAGE_DELAY_MS)
                continue
            }
            break
        }

        collected.push(...(data.results ?? []))
        if (!data.next_page_token) break
        pageToken = data.next_page_token
        await sleep(NEXT_PAGE_DELAY_MS)
    }

    return collected
}

async function textSearchAllPages(
    query: string,
    lat: number,
    lng: number,
    radiusM: number,
): Promise<RawPlace[]> {
    if (!GOOGLE_MAPS_API_KEY) return []

    const collected: RawPlace[] = []
    let pageToken: string | undefined

    for (let page = 0; page < MAX_PLACES_PAGES; page++) {
        const params = new URLSearchParams({
            query,
            location: `${lat},${lng}`,
            radius: String(radiusM),
            key: GOOGLE_MAPS_API_KEY,
        })
        if (pageToken) params.set('pagetoken', pageToken)

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
        const res = await fetch(url)
        if (!res.ok) break

        const data = (await res.json()) as {
            status?: string
            results?: RawPlace[]
            next_page_token?: string
        }

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            if (data.status === 'INVALID_REQUEST' && pageToken) {
                await sleep(NEXT_PAGE_DELAY_MS)
                continue
            }
            break
        }

        collected.push(...(data.results ?? []))
        if (!data.next_page_token) break
        pageToken = data.next_page_token
        await sleep(NEXT_PAGE_DELAY_MS)
    }

    return collected
}

function placeInScope(
    lat: number,
    lng: number,
    scope: InfrastructureSearchScope,
): boolean {
    if (scope.mode === 'state') {
        return pointInUsStateBBox(lng, lat, scope.stateCode)
    }
    if (scope.mode === 'radius') {
        return (
            calculateDistance(lat, lng, scope.center.lat, scope.center.lng) <=
            scope.radiusMile
        )
    }
    const b = scope.bounds
    if (lng < b.west || lng > b.east || lat < b.south || lat > b.north) return false
    if (scope.radiusClip) {
        return (
            calculateDistance(
                lat,
                lng,
                scope.radiusClip.center.lat,
                scope.radiusClip.center.lng,
            ) <= scope.radiusClip.radiusMile
        )
    }
    return true
}

function rawToResult(
    place: RawPlace,
    layer: GisFilterLayerDef,
    scope: InfrastructureSearchScope,
): InfrastructurePlaceResult | null {
    const lat = place.geometry?.location?.lat
    const lng = place.geometry?.location?.lng
    if (!place.place_id || lat == null || lng == null) return null
    if (place.business_status === 'CLOSED_PERMANENTLY') return null
    if (!placeInScope(lat, lng, scope)) return null

    if (layer.fetch.mode === 'google_nearby' || layer.fetch.mode === 'google_composite') {
        const requested = requestedTypeForLayer(layer)
        const matchesPrimary = placeMatchesRequestedType(
            place.types,
            requested,
            place.name,
        )
        const matchesResultType =
            layer.resultType === 'shelter'
                ? placeMatchesShelter(place.types, place.name)
                : placeMatchesRequestedType(place.types, layer.resultType, place.name)
        const matchesExtra =
            layer.fetch.mode === 'google_composite'
                ? (layer.fetch.extraNearbyTypes ?? []).some((type) =>
                      placeMatchesRequestedType(place.types, type, place.name),
                  )
                : false
        if (!matchesPrimary && !matchesResultType && !matchesExtra) {
            return null
        }
    } else if (layer.resultType === 'fire_station') {
        if (!placeMatchesRequestedType(place.types, 'fire_station', place.name)) {
            return null
        }
    }

    return {
        place_id: place.place_id,
        name: place.name ?? layer.label,
        placeType: layer.resultType,
        lat,
        lng,
        vicinity:
            place.vicinity ??
            place.formatted_address ??
            'Address not available',
        rating: place.rating,
        user_ratings_total: place.user_ratings_total,
    }
}

async function runPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
) {
    let idx = 0
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (idx < items.length) {
            const current = items[idx++]
            await worker(current)
        }
    })
    await Promise.all(runners)
}

const INFRA_RESULTS_PREFIX = 'infra:results:'

function memoryCacheKey(scope: InfrastructureSearchScope, layerIds: string[]) {
    return `${INFRA_RESULTS_PREFIX}${scopeCacheKey(scope)}|${layerIds.sort().join(',')}`
}

function buildSearchPlan(
    scope: InfrastructureSearchScope,
    viewportBounds?: MapBounds | null,
): SearchPlan {
    const fetchScope = resolveFetchScope(scope, viewportBounds)

    if (fetchScope.mode === 'state') {
        const plan = stateSearchPlan(fetchScope.stateCode)
        if (!plan) return { points: [], radiusM: PLACES_SEARCH_RADIUS_M, comprehensive: true }
        return { points: plan.points, radiusM: plan.radiusM, comprehensive: true }
    }
    if (fetchScope.mode === 'radius') {
        const plan = radiusSearchPlan(fetchScope.center, fetchScope.radiusMile)
        return { points: plan.points, radiusM: plan.radiusM, comprehensive: true }
    }
    const plan = viewportSearchPlan(fetchScope.bounds)
    return { points: plan.points, radiusM: plan.radiusM, comprehensive: false }
}

/** Scope Google fetches to the visible map area when a viewport is available. */
export function resolveFetchScope(
    scope: InfrastructureSearchScope,
    viewportBounds?: MapBounds | null,
): InfrastructureSearchScope {
    if (!viewportBounds) return scope

    if (scope.mode === 'state') {
        const stateBounds = boundsFromStateCode(scope.stateCode)
        const clipped = stateBounds
            ? intersectBounds(viewportBounds, stateBounds)
            : viewportBounds
        if (clipped) return { mode: 'bounds', bounds: clipped }
    }

    if (scope.mode === 'radius') {
        return scope
    }

    return scope
}

async function fetchGoogleCellPlaces(
    scope: InfrastructureSearchScope,
    scopeKey: string,
    req: FetchCellRequest,
    useDbCache: boolean,
): Promise<InfrastructurePlaceResult[]> {
    const { layer, center, radiusM } = req
    if (layer.fetch.mode === 'deployment') return []

    const cacheType = cellCacheTypeKey(layer)
    const gridLat = roundGridCoord(center.lat)
    const gridLng = roundGridCoord(center.lng)

    if (useDbCache) {
        const cached = await loadGridCellFromCache(scopeKey, cacheType, gridLat, gridLng)
        if (cached) {
            return cached.map((p) => ({ ...p, placeType: layer.resultType }))
        }
    }

    const rawPlaces = await fetchRawPlacesForLayer(layer, center, radiusM)

    const places: InfrastructurePlaceResult[] = []
    const seen = new Set<string>()

    for (const raw of rawPlaces) {
        const parsed = rawToResult(raw, layer, scope)
        if (!parsed || seen.has(parsed.place_id)) continue
        seen.add(parsed.place_id)
        places.push(parsed)
    }

    if (useDbCache) {
        await saveGridCellToCache(
            scopeKey,
            cacheType,
            gridLat,
            gridLng,
            places.map(({ place_id, name, placeType, lat, lng, vicinity, rating, user_ratings_total }) => ({
                place_id,
                name,
                placeType,
                lat,
                lng,
                vicinity,
                rating,
                user_ratings_total,
            })),
        )
    }

    return places
}

export function filterPlacesByBounds(
    results: InfrastructurePlaceResult[],
    bounds: MapBounds | null | undefined,
): InfrastructurePlaceResult[] {
    if (!bounds) return results
    return results.filter(
        (p) =>
            p.lng >= bounds.west &&
            p.lng <= bounds.east &&
            p.lat >= bounds.south &&
            p.lat <= bounds.north,
    )
}

export async function fetchGoogleFilterLayerPlaces(
    scope: InfrastructureSearchScope,
    layers: GisFilterLayerDef[],
    viewportBounds?: MapBounds | null,
): Promise<InfrastructurePlaceResult[]> {
    const googleLayers = layers.filter(
        (l) => l.fetch.mode !== 'deployment' && l.fetch.mode !== 'mongo',
    )
    if (googleLayers.length === 0) return []

    const fetchScope = resolveFetchScope(scope, viewportBounds)
    const plan = buildSearchPlan(scope, viewportBounds)
    if (plan.points.length === 0) return []

    const scopeKey = scopeCacheKey(fetchScope)
    const useDbCache = scope.mode === 'state' || scope.mode === 'radius'
    const byId = new Map<string, InfrastructurePlaceResult>()

    const layerMaps = await Promise.all(
        googleLayers.map(async (layer) => {
            const layerById = new Map<string, InfrastructurePlaceResult>()
            await runPool(plan.points, FETCH_CONCURRENCY, async (center) => {
                const cellPlaces = await fetchGoogleCellPlaces(
                    fetchScope,
                    scopeKey,
                    { layer, center, radiusM: plan.radiusM },
                    useDbCache,
                )
                for (const place of cellPlaces) {
                    if (!layerById.has(place.place_id)) layerById.set(place.place_id, place)
                }
            })
            return layerById
        }),
    )

    for (const layerById of layerMaps) {
        for (const [id, place] of layerById) {
            if (!byId.has(id)) byId.set(id, place)
        }
    }

    return [...byId.values()]
}

export async function fetchInfrastructurePlacesForLayers(
    scope: InfrastructureSearchScope,
    layers: GisFilterLayerDef[],
    opts?: { viewportBounds?: MapBounds | null },
): Promise<InfrastructurePlaceResult[]> {
    if (layers.length === 0) return []

    const layerIds = layers.map((l) => l.id)
    const memKey = memoryCacheKey(scope, layerIds)
    const cachedMem = await cacheGetJson<InfrastructurePlaceResult[]>(memKey)

    const byId = new Map<string, InfrastructurePlaceResult>()
    const googleLayers = layers.filter(
        (l) => l.fetch.mode !== 'deployment' && l.fetch.mode !== 'mongo',
    )

    if (cachedMem?.length) {
        for (const place of cachedMem) byId.set(place.place_id, place)
    } else if (googleLayers.length > 0) {
        const googleResults = await fetchGoogleFilterLayerPlaces(
            scope,
            googleLayers,
            opts?.viewportBounds,
        )
        for (const place of googleResults) {
            if (!byId.has(place.place_id)) byId.set(place.place_id, place)
        }
    }

    const allResults = [...byId.values()]
    if (allResults.length > 0) {
        await cacheSetJson(memKey, allResults, MEMORY_CACHE_TTL_MS)
    }

    const viewport =
        opts?.viewportBounds ??
        (scope.mode === 'bounds' ? scope.bounds : null)

    if (viewport) {
        return rankPlacesForViewport(allResults, viewport)
    }

    if (scope.mode === 'state' || scope.mode === 'radius') {
        return allResults
    }

    return filterPlacesByBounds(allResults, opts?.viewportBounds)
}

export { boundsFromStateCode, PLACES_SEARCH_RADIUS_M }
