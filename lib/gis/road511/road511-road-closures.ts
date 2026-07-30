import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes'
import {
    boundsFromStateCode,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import type { RoadClosureSegment } from '@/lib/gis/road-closure-types'
import { densifyPathAlongRoads } from '@/lib/gis/road-path-follow'
import { isGenuineFullRoadClosure } from '@/lib/gis/road511/road511-filters'
import type { Road511Event, Road511EventsResponse } from '@/lib/gis/road511/road511-types'

const ROAD511_EVENTS_URL = 'https://api.road511.com/api/v1/events'
const REQUEST_TIMEOUT_MS = 15_000
const PAGE_LIMIT = 100
/** Cap scanned pages per jurisdiction (noise-heavy feeds). */
const MAX_PAGES_PER_JURISDICTION = 6
/** Cap jurisdictions when the viewport spans many states. */
const MAX_JURISDICTIONS = 12
const JURISDICTION_CONCURRENCY = 4

export function road511ApiKey(): string | null {
    const key = process.env.ROAD511_API_KEY?.trim()
    return key ? key : null
}

function boundsForScope(scope: InfrastructureSearchScope): MapBounds | null {
    if (scope.mode === 'state') return boundsFromStateCode(scope.stateCode)
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
    return scope.bounds
}

function bboxIntersects(
    a: MapBounds,
    b: readonly [number, number, number, number],
): boolean {
    const [west, south, east, north] = b
    return !(a.east < west || a.west > east || a.north < south || a.south > north)
}

/** USPS codes whose envelopes intersect the search viewport. */
export function jurisdictionsForScope(scope: InfrastructureSearchScope): string[] {
    if (scope.mode === 'state') {
        return [scope.stateCode.toUpperCase()]
    }

    const bounds = boundsForScope(scope)
    if (!bounds) return []

    const hits: string[] = []
    for (const [code, bbox] of Object.entries(US_STATE_BBOX)) {
        if (code === 'PR') continue
        if (bboxIntersects(bounds, bbox)) hits.push(code)
    }
    hits.sort()
    return hits.slice(0, MAX_JURISDICTIONS)
}

function formatBbox(b: MapBounds): string {
    return `${b.west},${b.south},${b.east},${b.north}`
}

/** GeoJSON geometry → one or more lat/lng paths (same contract as the old TomTom mapper). */
function geometryToPaths(geometry: unknown): { lat: number; lng: number }[][] {
    if (!geometry || typeof geometry !== 'object') return []
    const g = geometry as { type?: string; coordinates?: unknown }
    const toLatLng = (pt: number[]) => ({ lat: pt[1], lng: pt[0] })

    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        const path = (g.coordinates as number[][])
            .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
            .map(toLatLng)
        return path.length >= 2 ? [path] : []
    }

    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
        return (g.coordinates as number[][][])
            .map((line) =>
                line
                    .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
                    .map(toLatLng),
            )
            .filter((line) => line.length >= 2)
    }

    if (g.type === 'Polygon' && Array.isArray((g.coordinates as unknown[])?.[0])) {
        const ring = ((g.coordinates as number[][][])[0] ?? [])
            .filter((pt) => pt.length >= 2)
            .map(toLatLng)
        return ring.length >= 2 ? [ring] : []
    }

    if (g.type === 'Point' && Array.isArray(g.coordinates) && (g.coordinates as number[]).length >= 2) {
        const [lng, lat] = g.coordinates as number[]
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
        const d = 0.0008
        return [
            [
                { lat: lat - d, lng },
                { lat: lat + d, lng },
            ],
        ]
    }

    return []
}

function roadNameFor(event: Road511Event): string {
    const roads = Array.isArray(event.affected_roads)
        ? event.affected_roads.map((r) => String(r).trim()).filter(Boolean)
        : []
    if (roads.length) return roads.join(' / ')
    const title = String(event.title ?? '').trim()
    if (title) {
        const dash = title.indexOf('—')
        if (dash >= 0) {
            const right = title.slice(dash + 1).trim()
            if (right) return right
        }
        return title
    }
    return 'Road closure'
}

async function eventToSegments(event: Road511Event): Promise<RoadClosureSegment[]> {
    const paths = geometryToPaths(event.location)
    if (paths.length === 0) {
        // Fall back to lat/lng fields when geometry is missing.
        const lat = Number(event.latitude)
        const lng = Number(event.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const d = 0.0008
            paths.push([
                { lat: lat - d, lng },
                { lat: lat + d, lng },
            ])
        }
    }
    if (paths.length === 0) return []

    const baseId = String(event.id ?? event.source_id ?? `road511-${roadNameFor(event)}`).slice(0, 100)
    const reason = String(event.description ?? event.title ?? 'Road closed').trim() || 'Road closed'
    const roadName = roadNameFor(event)
    // Prefer OSM roadway geometry (not driving directions) so closed/construction
    // bridges still draw on the pink highway like Google Maps.
    const densified = await Promise.all(
        paths.map((path) => densifyPathAlongRoads(path, { roadName, reason })),
    )
    const updatedAt = String(
        event.last_updated ?? event.start_time ?? new Date().toISOString(),
    )
    const cross = event.metadata?.crossstreet
    const startLocation =
        typeof cross === 'string' && cross.trim() ? cross.trim() : undefined

    const out: RoadClosureSegment[] = []
    densified.forEach((path, pathIdx) => {
        if (path.length < 2) return
        out.push({
            id: densified.length > 1 ? `${baseId}-${pathIdx}` : baseId,
            roadName: roadName.slice(0, 120),
            status: 'Closed',
            reason: reason.slice(0, 280),
            startLocation,
            endLocation: event.direction ? `Dir: ${event.direction}` : undefined,
            updatedAt,
            source: 'Road511',
            path,
        })
    })
    return out
}

async function fetchRoad511Page(opts: {
    key: string
    jurisdiction: string
    bbox: string
    offset: number
}): Promise<{ events: Road511Event[]; hasMore: boolean; httpStatus: number | null }> {
    const params = new URLSearchParams({
        jurisdiction: opts.jurisdiction,
        bbox: opts.bbox,
        limit: String(PAGE_LIMIT),
        offset: String(opts.offset),
    })

    let res: Response
    try {
        res = await fetch(`${ROAD511_EVENTS_URL}?${params.toString()}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: {
                Accept: 'application/json',
                'X-API-Key': opts.key,
            },
        })
    } catch (err) {
        console.warn('[road511] request failed:', err)
        return { events: [], hasMore: false, httpStatus: null }
    }

    if (!res.ok) {
        console.warn(`[road511] HTTP ${res.status} jurisdiction=${opts.jurisdiction}`)
        return { events: [], hasMore: false, httpStatus: res.status }
    }

    let data: Road511EventsResponse
    try {
        data = (await res.json()) as Road511EventsResponse
    } catch {
        return { events: [], hasMore: false, httpStatus: res.status }
    }

    const events = Array.isArray(data.data) ? data.data : []
    return {
        events,
        hasMore: Boolean(data.has_more),
        httpStatus: res.status,
    }
}

async function fetchJurisdictionClosures(
    key: string,
    jurisdiction: string,
    bounds: MapBounds,
    nowMs: number,
): Promise<{ segments: RoadClosureSegment[]; httpStatus: number | null }> {
    const bbox = formatBbox(bounds)
    const byId = new Map<string, RoadClosureSegment>()
    let httpStatus: number | null = null
    let offset = 0

    for (let page = 0; page < MAX_PAGES_PER_JURISDICTION; page += 1) {
        const result = await fetchRoad511Page({ key, jurisdiction, bbox, offset })
        if (result.httpStatus != null) httpStatus = result.httpStatus
        if (result.httpStatus != null && result.httpStatus >= 400 && page === 0) {
            return { segments: [], httpStatus }
        }

        const keepers = result.events.filter((event) => isGenuineFullRoadClosure(event, nowMs))
        const segmentBatches = await Promise.all(keepers.map((event) => eventToSegments(event)))
        for (const segments of segmentBatches) {
            for (const segment of segments) {
                if (!byId.has(segment.id)) byId.set(segment.id, segment)
            }
        }

        if (!result.hasMore || result.events.length === 0) break
        offset += PAGE_LIMIT
    }

    return { segments: [...byId.values()], httpStatus }
}

async function runBatched<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += concurrency) {
        const slice = items.slice(i, i + concurrency)
        results.push(...(await Promise.all(slice.map((item) => worker(item)))))
    }
    return results
}

/**
 * Fetch genuine full road closures from Road511 for the given map scope.
 */
export async function fetchRoad511Closures(scope: InfrastructureSearchScope): Promise<{
    closures: RoadClosureSegment[]
    ok: boolean
    httpStatus: number | null
    warning?: string
}> {
    const key = road511ApiKey()
    if (!key) {
        return {
            closures: [],
            ok: false,
            httpStatus: null,
            warning: 'ROAD511_API_KEY is not set.',
        }
    }

    const bounds = boundsForScope(scope)
    if (!bounds) {
        return { closures: [], ok: false, httpStatus: null, warning: 'Could not resolve map bounds.' }
    }

    const jurisdictions = jurisdictionsForScope(scope)
    if (jurisdictions.length === 0) {
        return { closures: [], ok: true, httpStatus: 200 }
    }

    const nowMs = Date.now()
    const batches = await runBatched(jurisdictions, JURISDICTION_CONCURRENCY, (code) =>
        fetchJurisdictionClosures(key, code, bounds, nowMs),
    )

    const byId = new Map<string, RoadClosureSegment>()
    let anyOk = false
    let lastError: number | null = null

    for (const batch of batches) {
        if (batch.httpStatus === 200) anyOk = true
        if (batch.httpStatus != null && batch.httpStatus >= 400) lastError = batch.httpStatus
        for (const segment of batch.segments) {
            if (!byId.has(segment.id)) byId.set(segment.id, segment)
        }
    }

    let warning: string | undefined
    if (!anyOk) {
        if (lastError === 401 || lastError === 403) {
            warning = 'Road511 API returned unauthorized (check ROAD511_API_KEY).'
        } else if (lastError) {
            warning = `Road511 API returned HTTP ${lastError}.`
        } else {
            warning = 'Road511 API unreachable.'
        }
    }

    return {
        closures: [...byId.values()],
        ok: anyOk,
        httpStatus: anyOk ? 200 : lastError,
        warning,
    }
}
