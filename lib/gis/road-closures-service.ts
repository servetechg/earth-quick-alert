import connectDB from '@/lib/mongodb'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store'
import {
    boundsFromStateCode,
    type InfrastructureSearchScope,
    type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes'
import { calculateDistance } from '@/lib/services/mock-map-service'
import type { RoadClosureSegment, RoadClosureStatus } from '@/lib/gis/road-closure-types'
import { fetchWzdxClosures, wzdxStateCodesForScope } from '@/lib/gis/wzdx/wzdx-road-closures'
import IncidentReport from '@/models/IncidentReport'

const NWS_BASE = 'https://api.weather.gov'
/** Combined road-closure API response cache (Redis + memory fallback). */
const CACHE_TTL_MS = 10 * 60 * 1000
const ROAD_CLOSURE_PREFIX = 'map-layer:road-closures:'

function nwsHeaders(): HeadersInit {
    return {
        Accept: 'application/geo+json',
        'User-Agent': process.env.NWS_USER_AGENT || 'ready2go-emergency-dashboard (road-closures)',
    }
}

function configuredSources(): string[] {
    const raw = process.env.ROAD_CLOSURE_DATA_SOURCES ?? 'wzdx,nws,reports'
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
}

function scopeCacheKey(scope: InfrastructureSearchScope): string {
    if (scope.mode === 'state') return `state:${scope.stateCode.toUpperCase()}`
    if (scope.mode === 'radius') {
        return `radius:${scope.center.lat.toFixed(3)},${scope.center.lng.toFixed(3)}:${scope.radiusMile}`
    }
    const wzdxStates = wzdxStateCodesForScope(scope)
    if (wzdxStates.length > 0) {
        return `states:${[...wzdxStates].sort().join(',')}`
    }
    const b = scope.bounds
    return `bounds:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}`
}

function pointInScope(
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
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north
}

function pathIntersectsScope(
    path: { lat: number; lng: number }[],
    scope: InfrastructureSearchScope,
): boolean {
    return path.some((p) => pointInScope(p.lat, p.lng, scope))
}

function pathMidpoint(path: { lat: number; lng: number }[]): { lat: number; lng: number } {
    if (path.length === 0) return { lat: 0, lng: 0 }
    const mid = path[Math.floor(path.length / 2)]
    return { lat: mid.lat, lng: mid.lng }
}

function normalizeStatus(raw: string): RoadClosureStatus {
    const s = raw.toLowerCase()
    if (s.includes('closed') && !s.includes('lane')) return 'Closed'
    if (s.includes('restrict') || s.includes('limited')) return 'Restricted'
    if (s.includes('lane')) return 'Lane Closure'
    return 'Unknown'
}

function parseStartEnd(text: string): { start?: string; end?: string } {
    const between = text.match(/between\s+(.+?)\s+and\s+(.+?)(?:\.|,|$)/i)
    if (between) return { start: between[1].trim(), end: between[2].trim() }
    const fromTo = text.match(/from\s+(.+?)\s+to\s+(.+?)(?:\.|,|$)/i)
    if (fromTo) return { start: fromTo[1].trim(), end: fromTo[2].trim() }
    return {}
}

function isNwsAlertActiveNow(props: Record<string, unknown>, nowMs = Date.now()): boolean {
    const expiresMs = Date.parse(String(props.expires ?? props.ends ?? ''))
    if (Number.isFinite(expiresMs) && expiresMs < nowMs) return false

    const onsetMs = Date.parse(String(props.onset ?? props.effective ?? ''))
    if (Number.isFinite(onsetMs) && onsetMs > nowMs) return false

    return true
}

function isRoadClosureAlert(props: Record<string, unknown>): boolean {
    const event = String(props.event ?? '')
    if (/road closure|lane closure|bridge closure|street closure|highway closure|traffic/i.test(event)) {
        return true
    }
    const text = `${props.headline ?? ''} ${props.description ?? ''}`.slice(0, 4000)
    return /road(s)? (is |are )?closed|highway closed|bridge closed|interstate.*closed|detour|impassable|roadway closed|street closed/i.test(
        text,
    )
}

function geoJsonToPaths(geometry: unknown): { lat: number; lng: number }[][] {
    if (!geometry || typeof geometry !== 'object') return []
    const g = geometry as { type?: string; coordinates?: unknown }
    const toLatLng = (pt: number[]) => ({ lat: pt[1], lng: pt[0] })

    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        const path = (g.coordinates as number[][])
            .filter((pt) => pt.length >= 2)
            .map(toLatLng)
        return path.length >= 2 ? [path] : []
    }

    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
        return (g.coordinates as number[][][])
            .map((line) => line.filter((pt) => pt.length >= 2).map(toLatLng))
            .filter((line) => line.length >= 2)
    }

    if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
        const ring = (g.coordinates[0] as number[][])
            .filter((pt) => pt.length >= 2)
            .map(toLatLng)
        if (ring.length < 2) return []
        const open = ring[0].lat === ring[ring.length - 1].lat &&
            ring[0].lng === ring[ring.length - 1].lng
            ? ring.slice(0, -1)
            : ring
        if (open.length >= 2) return [open]
    }

    return []
}

function segmentFromPoint(lat: number, lng: number, label?: string): { lat: number; lng: number }[] {
    const d = 0.004
    return [
        { lat: lat - d, lng },
        { lat: lat + d, lng },
    ]
}

async function fetchNwsClosures(scope: InfrastructureSearchScope): Promise<RoadClosureSegment[]> {
    const area =
        scope.mode === 'state' && scope.stateCode
            ? scope.stateCode.toUpperCase()
            : null

    const url = area
        ? `${NWS_BASE}/alerts/active?status=actual&area=${encodeURIComponent(area)}`
        : `${NWS_BASE}/alerts/active?status=actual`

    const res = await fetch(url, { headers: nwsHeaders() })
    if (!res.ok) return []

    const data = (await res.json()) as { features?: unknown[] }
    const out: RoadClosureSegment[] = []
    const seen = new Set<string>()

    for (const feature of data.features ?? []) {
        const f = feature as {
            id?: string
            geometry?: unknown
            properties?: Record<string, unknown>
        }
        const props = f.properties ?? {}
        if (!isRoadClosureAlert(props) || !isNwsAlertActiveNow(props)) continue

        const paths = geoJsonToPaths(f.geometry)
        const event = String(props.event ?? 'Road Closure')
        const headline = String(props.headline ?? props.event ?? 'Road Closure')
        const description = String(props.description ?? '')
        const { start, end } = parseStartEnd(description)
        const updatedAt =
            String(props.sent ?? props.effective ?? props.onset ?? new Date().toISOString())
        const status = normalizeStatus(event)
        const reason =
            String(props.description ?? '')
                .split('\n')[0]
                ?.slice(0, 280) || undefined

        const roadName =
            headline.replace(/^.*?\s-\s/, '').slice(0, 120) ||
            String(props.areaDesc ?? 'Affected roadway')

        if (paths.length === 0) continue

        paths.forEach((path, idx) => {
            if (!pathIntersectsScope(path, scope)) return
            const id = String(f.id ?? `nws-${headline}-${idx}`).slice(0, 120)
            if (seen.has(id)) return
            seen.add(id)
            out.push({
                id,
                roadName,
                status,
                reason,
                startLocation: start,
                endLocation: end,
                updatedAt,
                source: 'NWS',
                path,
            })
        })
    }

    return out
}

async function fetchOsmClosures(scope: InfrastructureSearchScope): Promise<RoadClosureSegment[]> {
    let bounds: MapBounds | null = null
    if (scope.mode === 'state') bounds = boundsFromStateCode(scope.stateCode)
    else if (scope.mode === 'radius') {
        const latDelta = scope.radiusMile / 69
        const cosLat = Math.cos((scope.center.lat * Math.PI) / 180)
        const lngDelta = scope.radiusMile / (69 * Math.max(0.2, Math.abs(cosLat)))
        bounds = {
            south: scope.center.lat - latDelta,
            north: scope.center.lat + latDelta,
            west: scope.center.lng - lngDelta,
            east: scope.center.lng + lngDelta,
        }
    } else bounds = scope.bounds

    if (!bounds) return []

    const { south, west, north, east } = bounds
    const query = `[out:json][timeout:25];
(
  way["highway"]["access"="no"](${south},${west},${north},${east});
  way["highway"]["construction"="yes"](${south},${west},${north},${east});
  way["highway"]["proposed"](${south},${west},${north},${east});
);
out geom;`

    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
    })
    if (!res.ok) return []

    const data = (await res.json()) as {
        elements?: Array<{
            id?: number
            tags?: Record<string, string>
            geometry?: Array<{ lat: number; lon: number }>
        }>
    }

    const out: RoadClosureSegment[] = []
    for (const el of data.elements ?? []) {
        const geom = el.geometry
        if (!geom || geom.length < 2) continue
        const path = geom.map((p) => ({ lat: p.lat, lng: p.lon }))
        if (!pathIntersectsScope(path, scope)) continue

        const tags = el.tags ?? {}
        const roadName = tags.name || tags.ref || tags['official_name'] || 'Unnamed road'
        const status = tags.access === 'no' ? 'Closed' : tags.construction === 'yes' ? 'Restricted' : 'Lane Closure'

        out.push({
            id: `osm-${el.id}`,
            roadName,
            status: normalizeStatus(status),
            reason: tags.description || tags.note || tags.construction || undefined,
            startLocation: tags['addr:street'] || undefined,
            updatedAt: new Date().toISOString(),
            source: 'OpenStreetMap',
            path,
        })
    }

    return out
}

async function fetchReportClosures(scope: InfrastructureSearchScope): Promise<RoadClosureSegment[]> {
    await connectDB()
    const out: RoadClosureSegment[] = []
    const seen = new Set<string>()

    const incidents = await IncidentReport.find({
        type: 'Road Closure',
        status: { $ne: 'Resolved' },
    })
        .select('location lat lng description status updatedAt createdAt')
        .lean()

    for (const row of incidents) {
        const lat = typeof row.lat === 'number' ? row.lat : null
        const lng = typeof row.lng === 'number' ? row.lng : null
        if (lat == null || lng == null) continue
        const path = segmentFromPoint(lat, lng, row.location)
        if (!pathIntersectsScope(path, scope)) continue
        const id = `incident-${String(row._id)}`
        if (seen.has(id)) continue
        seen.add(id)
        out.push({
            id,
            roadName: row.location || 'Reported closure',
            status: row.status === 'Active' ? 'Closed' : 'Restricted',
            reason: row.description || undefined,
            startLocation: row.location,
            updatedAt: (row.updatedAt ?? row.createdAt ?? new Date()).toISOString(),
            source: 'Incident Report',
            path,
        })
    }

    return out
}

async function fetchTomTomClosures(scope: InfrastructureSearchScope): Promise<RoadClosureSegment[]> {
    const key = process.env.TOMTOM_API_KEY?.trim()
    if (!key || process.env.TRAFFIC_PROVIDER?.toLowerCase() !== 'tomtom') return []

    let bounds: MapBounds | null = null
    if (scope.mode === 'state') bounds = boundsFromStateCode(scope.stateCode)
    else if (scope.mode === 'radius') {
        const latDelta = scope.radiusMile / 69
        const cosLat = Math.cos((scope.center.lat * Math.PI) / 180)
        const lngDelta = scope.radiusMile / (69 * Math.max(0.2, Math.abs(cosLat)))
        bounds = {
            south: scope.center.lat - latDelta,
            north: scope.center.lat + latDelta,
            west: scope.center.lng - lngDelta,
            east: scope.center.lng + lngDelta,
        }
    } else bounds = scope.bounds
    if (!bounds) return []

    const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}&bbox=${bbox}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,descriptionParts}}}}`

    const res = await fetch(url)
    if (!res.ok) return []

    const data = (await res.json()) as {
        incidents?: Array<{
            geometry?: { type?: string; coordinates?: number[][] | number[][][] }
            properties?: {
                events?: Array<{ description?: string; descriptionParts?: { value?: string }[] }>
            }
        }>
    }

    const out: RoadClosureSegment[] = []
    for (const inc of data.incidents ?? []) {
        const paths = geoJsonToPaths(inc.geometry)
        const event = inc.properties?.events?.[0]
        const desc =
            event?.description ||
            event?.descriptionParts?.map((p) => p.value).filter(Boolean).join(' ') ||
            'Traffic incident'
        const status = /closed/i.test(desc) ? 'Closed' : 'Restricted'

        for (const path of paths.length ? paths : []) {
            if (!pathIntersectsScope(path, scope)) continue
            out.push({
                id: `tomtom-${out.length}-${pathMidpoint(path).lat.toFixed(4)}`,
                roadName: desc.slice(0, 120),
                status: normalizeStatus(status),
                reason: desc,
                updatedAt: new Date().toISOString(),
                source: 'TomTom Traffic',
                path,
            })
        }
    }
    return out
}

export async function fetchRoadClosures(
    scope: InfrastructureSearchScope,
): Promise<{ closures: RoadClosureSegment[]; sources: string[]; fetchedAt: string }> {
    const key = `${ROAD_CLOSURE_PREFIX}${scopeCacheKey(scope)}`
    const cached = await cacheGetJson<RoadClosureSegment[]>(key)
    if (cached) {
        return {
            closures: cached,
            sources: configuredSources(),
            fetchedAt: new Date().toISOString(),
        }
    }

    const sources = configuredSources()
    const batches: RoadClosureSegment[][] = []

    if (sources.includes('wzdx')) batches.push(await fetchWzdxClosures(scope))
    if (sources.includes('nws')) batches.push(await fetchNwsClosures(scope))
    if (sources.includes('osm')) batches.push(await fetchOsmClosures(scope))
    if (sources.includes('reports')) batches.push(await fetchReportClosures(scope))
    if (sources.includes('tomtom')) batches.push(await fetchTomTomClosures(scope))

    const byId = new Map<string, RoadClosureSegment>()
    for (const batch of batches) {
        for (const closure of batch) {
            if (!byId.has(closure.id)) byId.set(closure.id, closure)
        }
    }

    const closures = [...byId.values()]
    await cacheSetJson(key, closures, CACHE_TTL_MS)

    return { closures, sources, fetchedAt: new Date().toISOString() }
}
