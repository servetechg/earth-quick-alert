import { getUsStateBbox, US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes'

/** Google Places Nearby Search maximum radius (meters). */
export const PLACES_SEARCH_RADIUS_M = 50_000

export type MapBounds = {
    west: number
    south: number
    east: number
    north: number
}

export type InfrastructureSearchScope =
    | { mode: 'state'; stateCode: string }
    | { mode: 'radius'; center: { lat: number; lng: number }; radiusMile: number }
    | {
          mode: 'bounds'
          bounds: MapBounds
          radiusClip?: { center: { lat: number; lng: number }; radiusMile: number }
      }

function mileToMeters(mile: number) {
    return mile * 1609.34
}

function pointInBounds(lng: number, lat: number, b: MapBounds) {
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north
}

function pointInCircle(
    lat: number,
    lng: number,
    center: { lat: number; lng: number },
    radiusMeters: number,
) {
    const R = 6371000
    const dLat = ((lat - center.lat) * Math.PI) / 180
    const dLng = ((lng - center.lng) * Math.PI) / 180
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((center.lat * Math.PI) / 180) *
            Math.cos((lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return dist <= radiusMeters
}

function gridInBounds(bounds: MapBounds, maxPoints: number): { lat: number; lng: number }[] {
    const latSpan = bounds.north - bounds.south
    const lngSpan = bounds.east - bounds.west
    if (latSpan <= 0 || lngSpan <= 0) return []

    const side = Math.max(1, Math.ceil(Math.sqrt(maxPoints)))
    const latStep = latSpan / side
    const lngStep = lngSpan / side
    const points: { lat: number; lng: number }[] = []

    for (let i = 0; i <= side; i++) {
        for (let j = 0; j <= side; j++) {
            points.push({
                lat: bounds.south + i * latStep,
                lng: bounds.west + j * lngStep,
            })
            if (points.length >= maxPoints) return points
        }
    }
    return points
}

/** Evenly subsample a grid when the full set would exceed API budget. */
export function capGridPoints(
    points: { lat: number; lng: number }[],
    maxCells: number,
): { lat: number; lng: number }[] {
    if (points.length <= maxCells) return points
    if (maxCells <= 0) return []
    const stride = points.length / maxCells
    const out: { lat: number; lng: number }[] = []
    for (let i = 0; i < points.length && out.length < maxCells; i += Math.max(1, Math.floor(stride))) {
        out.push(points[i])
    }
    return out
}

function maxGridCellsForSpan(spanDeg: number): number {
    if (spanDeg > 15) return 64
    if (spanDeg > 10) return 49
    if (spanDeg > 6) return 42
    if (spanDeg > 3) return 36
    if (spanDeg > 1.5) return 25
    if (spanDeg > 0.75) return 16
    if (spanDeg > 0.35) return 12
    if (spanDeg > 0.12) return 8
    return 4
}

export function boundsFromStateCode(stateCode: string): MapBounds | null {
    const bbox = getUsStateBbox(stateCode)
    if (!bbox) return null
    const [west, south, east, north] = bbox
    return { west, south, east, north }
}

export function boundsCenter(bounds: MapBounds): { lat: number; lng: number } {
    return {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2,
    }
}

export function intersectBounds(a: MapBounds, b: MapBounds): MapBounds | null {
    const west = Math.max(a.west, b.west)
    const south = Math.max(a.south, b.south)
    const east = Math.min(a.east, b.east)
    const north = Math.min(a.north, b.north)
    if (east <= west || north <= south) return null
    return { west, south, east, north }
}

export function viewportSpanDeg(bounds: MapBounds): number {
    return Math.max(bounds.north - bounds.south, bounds.east - bounds.west)
}

/** Approximate visible bounds before the map `idle` event fires (zoom > CONUS fallback). */
export function estimateBoundsFromCenterZoom(
    center: { lat: number; lng: number },
    zoom: number,
): MapBounds {
    const z = Math.max(4, Math.min(20, zoom))
    const worldSpan = 360 / 2 ** z
    const latSpan = worldSpan * 0.55
    const lngSpan = worldSpan * Math.cos((center.lat * Math.PI) / 180)
    return {
        west: center.lng - lngSpan / 2,
        east: center.lng + lngSpan / 2,
        south: center.lat - latSpan / 2,
        north: center.lat + latSpan / 2,
    }
}

export function boundsCoveringRadiusM(bounds: MapBounds): number {
    const center = boundsCenter(bounds)
    const latHalfKm = ((bounds.north - bounds.south) / 2) * 111.32
    const lngHalfKm =
        ((bounds.east - bounds.west) / 2) *
        111.32 *
        Math.cos((center.lat * Math.PI) / 180)
    const diagM = Math.sqrt(latHalfKm ** 2 + lngHalfKm ** 2) * 2 * 1000
    return Math.min(PLACES_SEARCH_RADIUS_M, Math.max(2000, Math.round(diagM * 0.45)))
}

/** Overlapping grid covering a state bbox with 50 km Nearby Search circles. */
export function buildStateSearchGrid(
    bounds: MapBounds,
    radiusM = PLACES_SEARCH_RADIUS_M,
): { lat: number; lng: number }[] {
    const center = boundsCenter(bounds)
    const latSpan = bounds.north - bounds.south
    const lngSpan = bounds.east - bounds.west
    if (latSpan <= 0 || lngSpan <= 0) return []

    // Space centers at ~85% of diameter so adjacent circles overlap.
    const overlapFactor = 0.85
    const spacingM = radiusM * 2 * overlapFactor
    const latSpacing = spacingM / 111_320
    const lngSpacing =
        spacingM / (111_320 * Math.cos((center.lat * Math.PI) / 180) || 1)

    const latSteps = Math.max(1, Math.ceil(latSpan / latSpacing))
    const lngSteps = Math.max(1, Math.ceil(lngSpan / lngSpacing))
    const latStep = latSpan / latSteps
    const lngStep = lngSpan / lngSteps

    const points: { lat: number; lng: number }[] = []
    for (let i = 0; i <= latSteps; i++) {
        for (let j = 0; j <= lngSteps; j++) {
            points.push({
                lat: bounds.south + i * latStep,
                lng: bounds.west + j * lngStep,
            })
        }
    }
    return points
}

export function stateSearchPlan(stateCode: string): {
    points: { lat: number; lng: number }[]
    radiusM: number
    spanDeg: number
} | null {
    const bounds = boundsFromStateCode(stateCode)
    if (!bounds) return null
    return {
        points: buildStateSearchGrid(bounds),
        radiusM: PLACES_SEARCH_RADIUS_M,
        spanDeg: viewportSpanDeg(bounds),
    }
}

export function radiusSearchPlan(
    center: { lat: number; lng: number },
    radiusMile: number,
): {
    points: { lat: number; lng: number }[]
    radiusM: number
    spanDeg: number
} {
    const radiusM = mileToMeters(radiusMile)
    if (radiusM <= PLACES_SEARCH_RADIUS_M) {
        return {
            points: [center],
            radiusM: Math.max(500, Math.round(radiusM)),
            spanDeg: (radiusMile / 69) * 2,
        }
    }

    const latDegPerM = 1 / 111_320
    const lngDegPerM =
        1 / (111_320 * Math.cos((center.lat * Math.PI) / 180) || 1)
    const halfLat = radiusM * latDegPerM
    const halfLng = radiusM * lngDegPerM
    const bounds: MapBounds = {
        west: center.lng - halfLng,
        east: center.lng + halfLng,
        south: center.lat - halfLat,
        north: center.lat + halfLat,
    }
    return {
        points: buildStateSearchGrid(bounds).filter((p) =>
            pointInCircle(p.lat, p.lng, center, radiusM),
        ),
        radiusM: PLACES_SEARCH_RADIUS_M,
        spanDeg: (radiusMile / 69) * 2,
    }
}

/** One Nearby Search per state centroid — fast nationwide coverage at country zoom. */
export function nationwideStateCentroidPlan(): {
    points: { lat: number; lng: number }[]
    radiusM: number
    spanDeg: number
} {
    const points: { lat: number; lng: number }[] = []
    for (const stateCode of Object.keys(US_STATE_BBOX)) {
        const bbox = getUsStateBbox(stateCode)
        if (!bbox) continue
        const [west, south, east, north] = bbox
        points.push({
            lat: (south + north) / 2,
            lng: (west + east) / 2,
        })
    }
    return { points, radiusM: PLACES_SEARCH_RADIUS_M, spanDeg: 30 }
}

/** Overlapping 50 km grid across the viewport — dense enough to show data without zooming in. */
export function viewportSearchPlan(bounds: MapBounds): {
    points: { lat: number; lng: number }[]
    radiusM: number
    spanDeg: number
} {
    const span = viewportSpanDeg(bounds)
    if (span > 8) {
        return nationwideStateCentroidPlan()
    }

    const coverR = boundsCoveringRadiusM(bounds)
    const maxCells = maxGridCellsForSpan(span)
    const points = capGridPoints(buildStateSearchGrid(bounds), maxCells)

    const radiusM =
        span > 0.75
            ? PLACES_SEARCH_RADIUS_M
            : Math.min(PLACES_SEARCH_RADIUS_M, Math.max(10_000, coverR))

    return { points, radiusM, spanDeg: span }
}

export function buildInfrastructureSearchGrid(scope: InfrastructureSearchScope): {
    lat: number
    lng: number
}[] {
    if (scope.mode === 'bounds') {
        return viewportSearchPlan(scope.bounds).points
    }
    if (scope.mode === 'state') {
        const bounds = boundsFromStateCode(scope.stateCode)
        if (!bounds) return []
        return buildStateSearchGrid(bounds)
    }
    if (scope.mode === 'radius') {
        return radiusSearchPlan(scope.center, scope.radiusMile).points
    }
    return []
}
