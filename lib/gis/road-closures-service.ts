import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store'
import {
    boundsFromStateCode,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import { pointInUsStateBBox, US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes'
import { calculateDistance } from '@/lib/services/mock-map-service'
import type { RoadClosureSegment, RoadClosureStatus } from '@/lib/gis/road-closure-types'

/**
 * Real-time road closures via the TomTom Traffic Incident Details API (v5).
 *
 * We ONLY request `categoryFilter=8` (road closures) so normal traffic jams are
 * excluded, and derive the closure status/road name from the incident `events`.
 * The viewport bounding box is passed straight through from the map, and large
 * scopes (e.g. a full state) are tiled so a single request never has to cover an
 * area big enough to time out.
 */
const TOMTOM_INCIDENTS_URL =
    'https://api.tomtom.com/traffic/services/5/incidentDetails'

/** Spec fields + a few extras (from/to/roadNumbers) used only for nicer labels. */
const TOMTOM_FIELDS =
    '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,startTime,endTime,from,to,roadNumbers,events{code,description}}}}'

/** iconCategory 8 = Road Closed. */
const ROAD_CLOSURE_CATEGORY = '8'

const CACHE_TTL_MS = 10 * 60 * 1000
/** Short TTL for empty results so a transient miss never sticks for 10 minutes. */
const EMPTY_CACHE_TTL_MS = 60 * 1000
/** Bump the version suffix to invalidate previously cached results. */
const ROAD_CLOSURE_PREFIX = 'map-layer:road-closures:v3:'

/**
 * TomTom rejects any bounding box larger than 10,000 km² with HTTP 400, so every
 * request must stay under that. We tile into ~90 km cells (≈8,100 km², safely
 * below the cap).
 *
 * - Small viewport (zoomed in): fully cover it with a contiguous grid so the user
 *   sees every closure in view ("fetch on move" detail).
 * - Large viewport (zoomed out / national): put one cell over every visible
 *   state's centre plus an evenly-distributed fill so closures show up across the
 *   whole country instead of a single central cluster.
 */
const MAX_TILE_KM = 90
const OVERVIEW_TILE_KM = 96
const KM_PER_DEG_LAT = 110.574
const KM_PER_DEG_LNG_EQUATOR = 111.32
/** Above this cell count the viewport is treated as an "overview" (zoomed out). */
const MAX_DETAIL_TILES = 24
/** Hard cap on TomTom requests per overview fetch. */
const MAX_OVERVIEW_TILES = 54
const TILE_CONCURRENCY = 6
const REQUEST_TIMEOUT_MS = 12_000

function tomTomKey(): string | null {
    const key = process.env.TOMTOM_API_KEY?.trim()
    return key ? key : null
}

function scopeCacheKey(scope: InfrastructureSearchScope): string {
    if (scope.mode === 'state') return `state:${scope.stateCode.toUpperCase()}`
    if (scope.mode === 'radius') {
        return `radius:${scope.center.lat.toFixed(3)},${scope.center.lng.toFixed(3)}:${scope.radiusMile}`
    }
    const b = scope.bounds
    return `bounds:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}`
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

function kmPerDegLng(lat: number): number {
    return KM_PER_DEG_LNG_EQUATOR * Math.max(0.15, Math.cos((lat * Math.PI) / 180))
}

/** A square-ish cell of `km` sides centred on a point (stays under the 10,000 km² cap). */
function cellAround(lat: number, lng: number, km: number): MapBounds {
    const halfLat = km / 2 / KM_PER_DEG_LAT
    const halfLng = km / 2 / kmPerDegLng(lat)
    return {
        west: lng - halfLng,
        east: lng + halfLng,
        south: lat - halfLat,
        north: lat + halfLat,
    }
}

function boundsContainPoint(b: MapBounds, lat: number, lng: number): boolean {
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north
}

/** One cell centred on each US state whose centre lies inside the view. */
function perStateOverviewCells(b: MapBounds): MapBounds[] {
    const out: MapBounds[] = []
    for (const bbox of Object.values(US_STATE_BBOX)) {
        const [w, s, e, n] = bbox
        const cLat = (s + n) / 2
        const cLng = (w + e) / 2
        if (boundsContainPoint(b, cLat, cLng)) out.push(cellAround(cLat, cLng, OVERVIEW_TILE_KM))
    }
    return out
}

/** `target` cells spread evenly (2D) across the view for density between states. */
function distributedCells(b: MapBounds, target: number): MapBounds[] {
    if (target <= 0) return []
    const midLat = (b.south + b.north) / 2
    const latSpanKm = (b.north - b.south) * KM_PER_DEG_LAT
    const lngSpanKm = (b.east - b.west) * kmPerDegLng(midLat)
    const aspect = lngSpanKm / Math.max(1, latSpanKm)
    const cols = Math.max(1, Math.round(Math.sqrt(target * aspect)))
    const rows = Math.max(1, Math.ceil(target / cols))

    const out: MapBounds[] = []
    for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
            const cLng = b.west + ((i + 0.5) / cols) * (b.east - b.west)
            const cLat = b.south + ((j + 0.5) / rows) * (b.north - b.south)
            out.push(cellAround(cLat, cLng, MAX_TILE_KM))
        }
    }
    return out
}

/**
 * Split a bounding box into ~`MAX_TILE_KM` cells (each well under TomTom's 10,000 km²
 * cap). Small viewports are fully covered; large ones get one cell per visible state
 * plus distributed fill so closures appear nationwide.
 */
function tileBounds(b: MapBounds): MapBounds[] {
    const lngSpan = b.east - b.west
    const latSpan = b.south < b.north ? b.north - b.south : 0
    if (lngSpan <= 0 || latSpan <= 0) return []

    const midLat = (b.south + b.north) / 2
    const rows = Math.max(1, Math.ceil((latSpan * KM_PER_DEG_LAT) / MAX_TILE_KM))
    const cols = Math.max(1, Math.ceil((lngSpan * kmPerDegLng(midLat)) / MAX_TILE_KM))

    if (rows * cols <= MAX_DETAIL_TILES) {
        const dLat = latSpan / rows
        const dLng = lngSpan / cols
        const all: MapBounds[] = []
        for (let i = 0; i < cols; i += 1) {
            for (let j = 0; j < rows; j += 1) {
                all.push({
                    west: b.west + i * dLng,
                    east: b.west + (i + 1) * dLng,
                    south: b.south + j * dLat,
                    north: b.south + (j + 1) * dLat,
                })
            }
        }
        return all
    }

    const stateCells = perStateOverviewCells(b)
    const fill = distributedCells(b, MAX_OVERVIEW_TILES - stateCells.length)
    return [...stateCells, ...fill].slice(0, MAX_OVERVIEW_TILES)
}

function pointInScope(lat: number, lng: number, scope: InfrastructureSearchScope): boolean {
    if (scope.mode === 'state') return pointInUsStateBBox(lng, lat, scope.stateCode)
    if (scope.mode === 'radius') {
        return (
            calculateDistance(lat, lng, scope.center.lat, scope.center.lng) <=
            scope.radiusMile
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

function normalizeStatus(raw: string): RoadClosureStatus {
    const s = raw.toLowerCase()
    if (s.includes('closed') && !s.includes('lane')) return 'Closed'
    if (s.includes('restrict') || s.includes('limited')) return 'Restricted'
    if (s.includes('lane')) return 'Lane Closure'
    // categoryFilter=8 means every incident is a road closure by definition.
    return 'Closed'
}

/** GeoJSON geometry -> one or more lat/lng paths (LineString / MultiLineString / Polygon / Point). */
function geometryToPaths(geometry: unknown): { lat: number; lng: number }[][] {
    if (!geometry || typeof geometry !== 'object') return []
    const g = geometry as { type?: string; coordinates?: unknown }
    const toLatLng = (pt: number[]) => ({ lat: pt[1], lng: pt[0] })

    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        const path = (g.coordinates as number[][]).filter((pt) => pt.length >= 2).map(toLatLng)
        return path.length >= 2 ? [path] : []
    }

    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
        return (g.coordinates as number[][][])
            .map((line) => line.filter((pt) => pt.length >= 2).map(toLatLng))
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
        // Render a point closure as a short segment so it is visible as a line.
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

type TomTomIncident = {
    type?: string
    geometry?: { type?: string; coordinates?: unknown }
    properties?: {
        id?: string
        iconCategory?: number
        magnitudeOfDelay?: number
        startTime?: string
        endTime?: string
        from?: string
        to?: string
        roadNumbers?: string[]
        events?: Array<{ code?: number; description?: string }>
    }
}

function roadNameFor(props: TomTomIncident['properties'], description: string): string {
    const roads = Array.isArray(props?.roadNumbers)
        ? props!.roadNumbers.filter(Boolean).join(' / ')
        : ''
    if (roads) return roads
    if (props?.from && props?.to) return `${props.from} → ${props.to}`
    if (props?.from) return String(props.from)
    return description || 'Road closure'
}

function incidentToSegments(
    incident: TomTomIncident,
    index: number,
    scope: InfrastructureSearchScope,
): RoadClosureSegment[] {
    const props = incident.properties ?? {}
    const event = props.events?.[0]
    const description = String(event?.description ?? 'Closed').trim() || 'Closed'
    const status = normalizeStatus(description)
    const roadName = roadNameFor(props, description)
    const baseId = props.id ? String(props.id) : `tomtom-${index}`
    const updatedAt = props.startTime ? String(props.startTime) : new Date().toISOString()

    const paths = geometryToPaths(incident.geometry)
    const out: RoadClosureSegment[] = []
    paths.forEach((path, pathIdx) => {
        if (path.length < 2) return
        if (!pathIntersectsScope(path, scope)) return
        out.push({
            id: paths.length > 1 ? `${baseId}-${pathIdx}` : baseId,
            roadName,
            status,
            reason: description,
            startLocation: props.from ? String(props.from) : undefined,
            endLocation: props.to ? String(props.to) : undefined,
            updatedAt,
            source: 'TomTom Traffic',
            path,
        })
    })
    return out
}

async function fetchTomTomTile(
    key: string,
    bbox: MapBounds,
    scope: InfrastructureSearchScope,
    startIndex: number,
): Promise<RoadClosureSegment[]> {
    const params = new URLSearchParams({
        key,
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
        fields: TOMTOM_FIELDS,
        language: 'en-US',
        categoryFilter: ROAD_CLOSURE_CATEGORY,
        timeValidityFilter: 'present',
    })

    let res: Response
    try {
        res = await fetch(`${TOMTOM_INCIDENTS_URL}?${params.toString()}`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: { Accept: 'application/json' },
        })
    } catch {
        return []
    }
    if (!res.ok) return []

    let data: { incidents?: TomTomIncident[] }
    try {
        data = (await res.json()) as { incidents?: TomTomIncident[] }
    } catch {
        return []
    }

    const incidents = Array.isArray(data.incidents) ? data.incidents : []
    const out: RoadClosureSegment[] = []
    incidents.forEach((incident, i) => {
        out.push(...incidentToSegments(incident, startIndex + i, scope))
    })
    return out
}

async function runBatched<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += concurrency) {
        const slice = items.slice(i, i + concurrency)
        const settled = await Promise.all(
            slice.map((item, j) => worker(item, i + j)),
        )
        results.push(...settled)
    }
    return results
}

export async function fetchRoadClosures(
    scope: InfrastructureSearchScope,
): Promise<{ closures: RoadClosureSegment[]; sources: string[]; fetchedAt: string }> {
    const sources = ['TomTom Traffic']
    const key = tomTomKey()
    if (!key) {
        return { closures: [], sources, fetchedAt: new Date().toISOString() }
    }

    const cacheKey = `${ROAD_CLOSURE_PREFIX}${scopeCacheKey(scope)}`
    const cached = await cacheGetJson<RoadClosureSegment[]>(cacheKey)
    if (cached) {
        return { closures: cached, sources, fetchedAt: new Date().toISOString() }
    }

    const bounds = boundsForScope(scope)
    if (!bounds) {
        return { closures: [], sources, fetchedAt: new Date().toISOString() }
    }

    const tiles = tileBounds(bounds)
    const batches = await runBatched(tiles, TILE_CONCURRENCY, (tile, i) =>
        fetchTomTomTile(key, tile, scope, i * 1000),
    )

    const byId = new Map<string, RoadClosureSegment>()
    for (const batch of batches) {
        for (const segment of batch) {
            if (!byId.has(segment.id)) byId.set(segment.id, segment)
        }
    }

    const closures = [...byId.values()]
    await cacheSetJson(
        cacheKey,
        closures,
        closures.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS,
    )

    return { closures, sources, fetchedAt: new Date().toISOString() }
}
