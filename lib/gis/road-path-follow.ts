/**
 * Snap sparse road-closure polylines onto real roadway geometry.
 *
 * IMPORTANT: Do NOT use driving directions as the primary strategy. When a road
 * is closed/under construction in OSM, routers (OSRM/Valhalla/Google) avoid it
 * and send the line through neighborhoods — the opposite of Google Maps’ “red
 * dashes on the pink highway” look.
 *
 * Primary: OpenStreetMap way geometry (Overpass), including highway=construction.
 * Fallback: Google Snap / Directions when the API key works.
 * Last resort: OSRM only if the route stays near the closure chord.
 */

export type LatLng = { lat: number; lng: number }

const MAX_STRAIGHT_SEGMENT_KM = 0.15
const MIN_ROAD_SINUOSITY = 1.12
const ROUTE_TIMEOUT_MS = 12_000
const OVERPASS_TIMEOUT_MS = 20_000
/** Reject navigator fallbacks that wander farther than this from the chord. */
const MAX_ROUTE_CROSS_TRACK_KM = 0.35
const MAX_ROUTE_LENGTH_RATIO = 1.55
const CORRIDOR_BUFFER_KM = 0.18
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]

/** Short in-process cache so a viewport of closures does not hammer Overpass. */
const overpassCache = new Map<string, { expiresAt: number; ways: OsmWay[] }>()
const OVERPASS_CACHE_TTL_MS = 5 * 60_000

type OsmWay = {
    id: number
    refs: string[]
    highway?: string
    geometry: LatLng[]
}

function googleMapsApiKey(): string {
    const raw =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
        process.env.GOOGLE_MAPS_API_KEY?.trim() ||
        ''
    // Trailing punctuation from .env edits breaks Google auth.
    return raw.replace(/[.\s]+$/g, '')
}

function haversineKm(a: LatLng, b: LatLng): number {
    const R = 6371
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLng = ((b.lng - a.lng) * Math.PI) / 180
    const lat1 = (a.lat * Math.PI) / 180
    const lat2 = (b.lat * Math.PI) / 180
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function pathLengthKm(path: LatLng[]): number {
    let len = 0
    for (let i = 0; i < path.length - 1; i += 1) {
        len += haversineKm(path[i], path[i + 1])
    }
    return len
}

function pathSinuosity(path: LatLng[]): number {
    if (path.length < 2) return 1
    const chord = haversineKm(path[0], path[path.length - 1])
    if (chord < 0.05) return 1
    return pathLengthKm(path) / chord
}

function maxHopKm(path: LatLng[]): number {
    let max = 0
    for (let i = 0; i < path.length - 1; i += 1) {
        max = Math.max(max, haversineKm(path[i], path[i + 1]))
    }
    return max
}

function crossTrackMaxKm(path: LatLng[], a: LatLng, b: LatLng): number {
    let max = 0
    const dx = b.lng - a.lng
    const dy = b.lat - a.lat
    const len2 = dx * dx + dy * dy || 1
    for (const p of path) {
        const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2))
        const proj = { lat: a.lat + t * dy, lng: a.lng + t * dx }
        max = Math.max(max, haversineKm(p, proj))
    }
    return max
}

function routeQualityOk(path: LatLng[], a: LatLng, b: LatLng): boolean {
    if (path.length < 2) return false
    const chord = haversineKm(a, b)
    if (chord < 0.05) return path.length >= 2
    const len = pathLengthKm(path)
    if (len > chord * MAX_ROUTE_LENGTH_RATIO && crossTrackMaxKm(path, a, b) > MAX_ROUTE_CROSS_TRACK_KM) {
        return false
    }
    if (crossTrackMaxKm(path, a, b) > Math.max(MAX_ROUTE_CROSS_TRACK_KM, chord * 0.35)) {
        return false
    }
    return true
}

export function pathNeedsRoadFollow(path: LatLng[]): boolean {
    if (path.length < 2) return false
    const chord = haversineKm(path[0], path[path.length - 1])
    if (chord <= MAX_STRAIGHT_SEGMENT_KM && maxHopKm(path) <= MAX_STRAIGHT_SEGMENT_KM) {
        return false
    }
    if (path.length < 8 && chord > MAX_STRAIGHT_SEGMENT_KM) return true
    if (chord > MAX_STRAIGHT_SEGMENT_KM && pathSinuosity(path) < MIN_ROAD_SINUOSITY) return true
    if (maxHopKm(path) > MAX_STRAIGHT_SEGMENT_KM) return true
    return false
}

/** Pull highway refs like K-5 / KS 5 / I-635 / US-69 from free text. */
export function extractRoadRefs(text: string | undefined): string[] {
    if (!text) return []
    const found = new Set<string>()
    const patterns: RegExp[] = [
        /\bK-?\s*5\b/gi,
        /\bKS[-\s]?5\b/gi,
        /\bI-?\s*(\d{1,3})\b/gi,
        /\bUS[-\s]?(\d{1,3})\b/gi,
        /\bSH[-\s]?(\d{1,3})\b/gi,
        /\bSR[-\s]?(\d{1,3})\b/gi,
        /\b([A-Z]{1,2})\s+(\d{1,3})\b/g,
    ]
    for (const re of patterns) {
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
            const raw = m[0].toUpperCase().replace(/\s+/g, ' ').trim()
            if (/^K-?\s*5$/i.test(raw) || /^KS[-\s]?5$/i.test(raw)) {
                found.add('KS 5')
                found.add('K-5')
                continue
            }
            const normalized = raw
                .replace(/^I[-\s]?/i, 'I ')
                .replace(/^US[-\s]?/i, 'US ')
                .replace(/^SH[-\s]?/i, 'SH ')
                .replace(/^SR[-\s]?/i, 'SR ')
                .replace(/\s+/g, ' ')
                .trim()
            if (normalized.length >= 2) found.add(normalized)
        }
    }
    return [...found]
}

function nodeKey(p: LatLng): string {
    return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}

async function fetchOverpassWays(query: string): Promise<OsmWay[]> {
    const cached = overpassCache.get(query)
    if (cached && cached.expiresAt > Date.now()) return cached.ways

    const headers = {
        Accept: 'application/json',
        'User-Agent': 'Ready2Go/1.0 (emergency-dashboard; road-closure geometry)',
    }

    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
                headers,
                signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
            })
            if (!res.ok) continue
            const data = (await res.json()) as {
                elements?: Array<{
                    type?: string
                    id?: number
                    tags?: Record<string, string>
                    geometry?: Array<{ lat: number; lon: number }>
                }>
            }
            const ways: OsmWay[] = []
            for (const el of data.elements ?? []) {
                if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue
                const refTag = String(el.tags?.ref ?? '')
                const refs = refTag
                    .split(';')
                    .map((s) => s.trim())
                    .filter(Boolean)
                ways.push({
                    id: Number(el.id) || 0,
                    refs,
                    highway: el.tags?.highway,
                    geometry: el.geometry.map((g) => ({ lat: g.lat, lng: g.lon })),
                })
            }
            if (ways.length > 0) {
                overpassCache.set(query, { ways, expiresAt: Date.now() + OVERPASS_CACHE_TTL_MS })
                return ways
            }
        } catch {
            // try next endpoint
        }
    }
    return []
}

function boundsAround(a: LatLng, b: LatLng, padDeg: number) {
    return {
        south: Math.min(a.lat, b.lat) - padDeg,
        north: Math.max(a.lat, b.lat) + padDeg,
        west: Math.min(a.lng, b.lng) - padDeg,
        east: Math.max(a.lng, b.lng) + padDeg,
    }
}

async function fetchNamedRoadWays(a: LatLng, b: LatLng, refs: string[]): Promise<OsmWay[]> {
    const box = boundsAround(a, b, 0.025)
    const refClauses = refs
        .map((r) => {
            const esc = r.replace(/"/g, '\\"')
            return `way["ref"~"${esc}",i](${box.south},${box.west},${box.north},${box.east});`
        })
        .join('\n')
    // Include construction — closed bridges are often tagged that way in OSM.
    const query = `[out:json][timeout:25];(${refClauses});out geom;`
    return fetchOverpassWays(query)
}

async function fetchCorridorHighways(a: LatLng, b: LatLng): Promise<OsmWay[]> {
    const box = boundsAround(a, b, 0.02)
    const query = `[out:json][timeout:25];(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|construction)$"](${box.south},${box.west},${box.north},${box.east});
);out geom;`
    const ways = await fetchOverpassWays(query)
    // Keep only segments that stay near the closure chord (avoid city-wide graph).
    return ways.filter((w) => {
        const mid = w.geometry[Math.floor(w.geometry.length / 2)]
        return crossTrackMaxKm([mid, w.geometry[0], w.geometry[w.geometry.length - 1]], a, b) <= CORRIDOR_BUFFER_KM * 2.5
    })
}

/**
 * Undirected graph on OSM nodes → shortest geometry path between endpoints.
 * Ignores oneway so closed/construction bridges still draw on the pink road.
 */
function shortestPathOnWays(ways: OsmWay[], start: LatLng, end: LatLng): LatLng[] | null {
    if (ways.length === 0) return null

    type Edge = { to: string; dist: number; poly: LatLng[] }
    const adj = new Map<string, Edge[]>()
    const nodes = new Map<string, LatLng>()

    const addEdge = (from: string, to: string, poly: LatLng[]) => {
        const dist = pathLengthKm(poly)
        if (dist <= 0) return
        const list = adj.get(from) ?? []
        list.push({ to, dist, poly })
        adj.set(from, list)
    }

    for (const way of ways) {
        const geom = way.geometry
        for (let i = 0; i < geom.length; i += 1) {
            nodes.set(nodeKey(geom[i]), geom[i])
        }
        for (let i = 0; i < geom.length - 1; i += 1) {
            const a = geom[i]
            const b = geom[i + 1]
            const ka = nodeKey(a)
            const kb = nodeKey(b)
            addEdge(ka, kb, [a, b])
            addEdge(kb, ka, [b, a])
        }
    }

    if (nodes.size < 2) return null

    const nearestKey = (p: LatLng): string | null => {
        let best: string | null = null
        let bestD = Infinity
        for (const [k, n] of nodes) {
            const d = haversineKm(p, n)
            if (d < bestD) {
                bestD = d
                best = k
            }
        }
        // Endpoints must land near the road network.
        if (best == null || bestD > 0.45) return null
        return best
    }

    const startKey = nearestKey(start)
    const endKey = nearestKey(end)
    if (!startKey || !endKey) return null
    if (startKey === endKey) {
        const n = nodes.get(startKey)
        return n ? [start, n, end] : null
    }

    const dist = new Map<string, number>()
    const prev = new Map<string, { key: string; poly: LatLng[] }>()
    const pq: Array<{ key: string; d: number }> = []
    dist.set(startKey, 0)
    pq.push({ key: startKey, d: 0 })

    while (pq.length > 0) {
        pq.sort((x, y) => x.d - y.d)
        const cur = pq.shift()!
        if (cur.key === endKey) break
        if (cur.d !== dist.get(cur.key)) continue
        for (const edge of adj.get(cur.key) ?? []) {
            const nd = cur.d + edge.dist
            if (nd < (dist.get(edge.to) ?? Infinity)) {
                dist.set(edge.to, nd)
                prev.set(edge.to, { key: cur.key, poly: edge.poly })
                pq.push({ key: edge.to, d: nd })
            }
        }
    }

    if (!dist.has(endKey)) return null

    const chunks: LatLng[][] = []
    let walk: string | undefined = endKey
    while (walk && walk !== startKey) {
        const step = prev.get(walk)
        if (!step) break
        chunks.push(step.poly)
        walk = step.key
    }
    chunks.reverse()

    const out: LatLng[] = [start]
    for (const poly of chunks) {
        const pts = out.length === 0 ? poly : poly.slice(1)
        for (const p of pts) {
            const last = out[out.length - 1]
            if (!last || last.lat !== p.lat || last.lng !== p.lng) out.push(p)
        }
    }
    const last = out[out.length - 1]
    if (!last || last.lat !== end.lat || last.lng !== end.lng) out.push(end)

    return out.length >= 2 ? out : null
}

async function routeViaOsmGeometry(
    a: LatLng,
    b: LatLng,
    hintText?: string,
): Promise<LatLng[] | null> {
    const refs = extractRoadRefs(hintText)
    let ways = refs.length > 0 ? await fetchNamedRoadWays(a, b, refs) : []

    // Prefer ways whose ref matches; still keep construction.
    if (refs.length > 0 && ways.length > 0) {
        const preferred = ways.filter((w) =>
            w.refs.some((r) =>
                refs.some((want) => {
                    const R = r.toUpperCase()
                    const W = want.toUpperCase().replace(/^K-5$/, 'KS 5')
                    return R === W || R.includes(W) || W.includes(R)
                }),
            ),
        )
        if (preferred.length > 0) ways = preferred
    }

    const chord = haversineKm(a, b)
    const osmOk = (path: LatLng[] | null): path is LatLng[] => {
        if (!path || path.length < 2) return false
        // Highway bends are legitimate — allow more deviation than navigator fallbacks.
        if (crossTrackMaxKm(path, a, b) > Math.max(0.9, chord * 0.5)) return false
        if (pathLengthKm(path) > chord * 3) return false
        return true
    }

    let path = shortestPathOnWays(ways, a, b)
    if (osmOk(path)) return path

    // Corridor highways (no named ref, or named path failed).
    const corridor = await fetchCorridorHighways(a, b)
    path = shortestPathOnWays(corridor, a, b)
    if (osmOk(path)) return path

    return null
}

function decodeGooglePolyline(encoded: string): LatLng[] {
    const coordinates: LatLng[] = []
    let index = 0
    let lat = 0
    let lng = 0

    while (index < encoded.length) {
        let shift = 0
        let result = 0
        let byte: number
        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)
        const dlat = result & 1 ? ~(result >> 1) : result >> 1
        lat += dlat

        shift = 0
        result = 0
        do {
            byte = encoded.charCodeAt(index++) - 63
            result |= (byte & 0x1f) << shift
            shift += 5
        } while (byte >= 0x20)
        const dlng = result & 1 ? ~(result >> 1) : result >> 1
        lng += dlng

        coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 })
    }
    return coordinates
}

async function routeViaGoogleSnapToRoads(a: LatLng, b: LatLng): Promise<LatLng[] | null> {
    const key = googleMapsApiKey()
    if (!key) return null

    // Only endpoints — chord midpoints pull snaps onto the wrong parallel streets.
    const pathParam = `${a.lat},${a.lng}|${b.lat},${b.lng}`
    const url =
        `https://roads.googleapis.com/v1/snapToRoads?` +
        `path=${encodeURIComponent(pathParam)}&interpolate=true&key=${encodeURIComponent(key)}`

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) })
        if (!res.ok) return null
        const data = (await res.json()) as {
            snappedPoints?: Array<{ location?: { latitude?: number; longitude?: number } }>
            error?: { message?: string }
        }
        if (data.error || !Array.isArray(data.snappedPoints) || data.snappedPoints.length < 2) {
            return null
        }
        const path = data.snappedPoints
            .map((pt) => ({
                lat: Number(pt.location?.latitude),
                lng: Number(pt.location?.longitude),
            }))
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        return path.length >= 2 && routeQualityOk(path, a, b) ? path : null
    } catch {
        return null
    }
}

async function routeViaGoogleDirections(a: LatLng, b: LatLng): Promise<LatLng[] | null> {
    const key = googleMapsApiKey()
    if (!key) return null

    const params = new URLSearchParams({
        origin: `${a.lat},${a.lng}`,
        destination: `${b.lat},${b.lng}`,
        mode: 'driving',
        key,
    })

    try {
        const res = await fetch(
            `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
            { signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) },
        )
        if (!res.ok) return null
        const data = (await res.json()) as {
            status?: string
            routes?: Array<{ overview_polyline?: { points?: string } }>
        }
        if (data.status !== 'OK') return null
        const encoded = data.routes?.[0]?.overview_polyline?.points
        if (!encoded) return null
        const path = decodeGooglePolyline(encoded)
        return path.length >= 2 && routeQualityOk(path, a, b) ? path : null
    } catch {
        return null
    }
}

async function routeViaOsrm(a: LatLng, b: LatLng): Promise<LatLng[] | null> {
    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&alternatives=true`

    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
            headers: { Accept: 'application/json' },
        })
        if (!res.ok) return null
        const data = (await res.json()) as {
            code?: string
            routes?: Array<{ geometry?: { coordinates?: number[][] }; distance?: number }>
        }
        if (data.code !== 'Ok' || !Array.isArray(data.routes)) return null

        let best: LatLng[] | null = null
        let bestScore = Infinity
        for (const route of data.routes) {
            const coords = route.geometry?.coordinates
            if (!Array.isArray(coords) || coords.length < 2) continue
            const path = coords
                .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
                .map((pt) => ({ lat: pt[1], lng: pt[0] }))
            if (!routeQualityOk(path, a, b)) continue
            const score = crossTrackMaxKm(path, a, b) + pathLengthKm(path) * 0.05
            if (score < bestScore) {
                bestScore = score
                best = path
            }
        }
        return best
    } catch {
        return null
    }
}

async function routeAlongRoad(a: LatLng, b: LatLng, hintText?: string): Promise<LatLng[] | null> {
    const osm = await routeViaOsmGeometry(a, b, hintText)
    if (osm && osm.length >= 2) return osm

    const snap = await routeViaGoogleSnapToRoads(a, b)
    if (snap && snap.length >= 2) return snap

    const googlePath = await routeViaGoogleDirections(a, b)
    if (googlePath && googlePath.length >= 2) return googlePath

    return routeViaOsrm(a, b)
}

export type DensifyOptions = {
    roadName?: string
    reason?: string
}

/**
 * Replace cemetery-cutting chords with geometry that sits on the roadway
 * (OSM way geometry first — matches Google Maps pink-road overlay).
 */
export async function densifyPathAlongRoads(
    path: LatLng[],
    opts?: DensifyOptions,
): Promise<LatLng[]> {
    if (!pathNeedsRoadFollow(path)) return path

    const start = path[0]
    const end = path[path.length - 1]
    const hint = [opts?.roadName, opts?.reason].filter(Boolean).join(' ')

    if (path.length <= 4 || pathSinuosity(path) < MIN_ROAD_SINUOSITY) {
        const followed = await routeAlongRoad(start, end, hint)
        if (followed && followed.length >= 2) return followed
        return path
    }

    // Multi-vertex but long hops: only replace hops that need it, still OSM-first.
    const out: LatLng[] = [start]
    for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i]
        const b = path[i + 1]
        if (haversineKm(a, b) <= MAX_STRAIGHT_SEGMENT_KM) {
            out.push(b)
            continue
        }
        const followed = await routeAlongRoad(a, b, hint)
        if (followed && followed.length >= 2) {
            out.push(...followed.slice(1))
        } else {
            out.push(b)
        }
    }
    return out.length >= 2 ? out : path
}

export async function densifyClosurePaths(
    paths: LatLng[][],
    opts?: DensifyOptions,
): Promise<LatLng[][]> {
    return Promise.all(paths.map((p) => densifyPathAlongRoads(p, opts)))
}
