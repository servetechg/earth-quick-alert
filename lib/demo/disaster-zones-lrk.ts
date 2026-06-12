/** Separate post-disaster impact circles along the tornado track (not nested). */

export type DisasterZoneCircleSpec = {
  id: 'zone_a' | 'zone_b' | 'zone_c'
  center: { lat: number; lng: number }
  radiusMeters: number
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWeight: number
  label: string
}

const EARTH_RADIUS_MILE = 3959
const MILE_TO_METERS = 1609.34

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI
}

/** Offset a point by distance (miles) along bearing (degrees). */
export function offsetPointMiles(
  lat: number,
  lng: number,
  bearingDeg: number,
  distMile: number,
): { lat: number; lng: number } {
  const brng = toRad(bearingDeg)
  const d = distMile / EARTH_RADIUS_MILE
  const lat1 = toRad(lat)
  const lng1 = toRad(lng)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: toDeg(lat2), lng: toDeg(lng2) }
}

/** Default LRK tornado survey path [lat, lng]. */
export const LRK_TORNADO_PATH_LATLNG: { lat: number; lng: number }[] = [
  { lat: 34.729, lng: -92.406 },
  { lat: 34.738, lng: -92.448 },
  { lat: 34.748, lng: -92.456 },
  { lat: 34.758, lng: -92.438 },
  { lat: 34.765, lng: -92.418 },
  { lat: 34.771, lng: -92.388 },
  { lat: 34.778, lng: -92.365 },
  { lat: 34.769, lng: -92.355 },
  { lat: 34.792, lng: -92.265 },
  { lat: 34.805, lng: -92.235 },
  { lat: 34.815, lng: -92.215 },
  { lat: 34.848, lng: -92.155 },
  { lat: 34.866, lng: -92.125 },
  { lat: 34.892, lng: -92.085 },
  { lat: 34.915, lng: -92.045 },
]

/** Pick a path point by fraction 0–1 (0 = touchdown / west, 1 = east end). */
function pathPointAt(path: { lat: number; lng: number }[], fraction: number): { lat: number; lng: number } {
  if (path.length === 0) return { lat: 34.748, lng: -92.438 }
  if (path.length === 1) return path[0]
  const idx = Math.round((path.length - 1) * Math.min(1, Math.max(0, fraction)))
  return path[idx]
}

/** Separate centers + radii along the EF-3 track (west → east, A worst → C moderate). */
const ZONE_LAYOUT = {
  zone_a: { pathFraction: 0.2, radiusMile: 4.0 },
  zone_b: { pathFraction: 0.52, radiusMile: 5.0 },
  zone_c: { pathFraction: 0.88, radiusMile: 5.5 },
} as const

export function buildTornadoDisasterZoneCircles(
  path: { lat: number; lng: number }[] = LRK_TORNADO_PATH_LATLNG,
): DisasterZoneCircleSpec[] {
  const pts = path.length >= 2 ? path : LRK_TORNADO_PATH_LATLNG

  return [
    {
      id: 'zone_a',
      center: pathPointAt(pts, ZONE_LAYOUT.zone_a.pathFraction),
      radiusMeters: ZONE_LAYOUT.zone_a.radiusMile * MILE_TO_METERS,
      fillColor: '#DC2626',
      fillOpacity: 0.3,
      strokeColor: '#991B1B',
      strokeWeight: 3,
      label: 'Zone A',
    },
    {
      id: 'zone_b',
      center: pathPointAt(pts, ZONE_LAYOUT.zone_b.pathFraction),
      radiusMeters: ZONE_LAYOUT.zone_b.radiusMile * MILE_TO_METERS,
      fillColor: '#F59E0B',
      fillOpacity: 0.24,
      strokeColor: '#B45309',
      strokeWeight: 2,
      label: 'Zone B',
    },
    {
      id: 'zone_c',
      center: pathPointAt(pts, ZONE_LAYOUT.zone_c.pathFraction),
      radiusMeters: ZONE_LAYOUT.zone_c.radiusMile * MILE_TO_METERS,
      fillColor: '#FBBF24',
      fillOpacity: 0.18,
      strokeColor: '#D97706',
      strokeWeight: 2,
      label: 'Zone C',
    },
  ]
}

/** Label position near the center of each separate circle. */
export function zoneLabelPosition(
  zone: DisasterZoneCircleSpec,
  _bearing = 0,
  _radiusFraction = 0,
): { lat: number; lng: number } {
  return { lat: zone.center.lat, lng: zone.center.lng }
}

export function disasterZonesToMapCircles(
  path?: { lat: number; lng: number }[],
): DisasterZoneCircleSpec[] {
  const pts = path && path.length >= 2 ? path : LRK_TORNADO_PATH_LATLNG
  return buildTornadoDisasterZoneCircles(pts)
}

export function boundsFromPath(path: { lat: number; lng: number }[], paddingDeg = 0.06) {
  const circles = buildTornadoDisasterZoneCircles(
    path.length >= 2 ? path : LRK_TORNADO_PATH_LATLNG,
  )
  return boundsFromDisasterZones(circles, paddingDeg)
}

/** Bounding box that fits all separate zone circles. */
export function boundsFromDisasterZones(
  circles: DisasterZoneCircleSpec[],
  paddingDeg = 0.05,
): { west: number; south: number; east: number; north: number } {
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity

  for (const z of circles) {
    const mile = z.radiusMeters / MILE_TO_METERS
    const latDelta = mile / 69
    const lngDelta = mile / (69 * Math.max(0.2, Math.abs(Math.cos(toRad(z.center.lat)))))
    south = Math.min(south, z.center.lat - latDelta)
    north = Math.max(north, z.center.lat + latDelta)
    west = Math.min(west, z.center.lng - lngDelta)
    east = Math.max(east, z.center.lng + lngDelta)
  }

  if (!Number.isFinite(south)) {
    const c = { lat: 34.78, lng: -92.3 }
    return {
      south: c.lat - 0.15,
      north: c.lat + 0.15,
      west: c.lng - 0.2,
      east: c.lng + 0.2,
    }
  }

  return {
    south: south - paddingDeg,
    north: north + paddingDeg,
    west: west - paddingDeg,
    east: east + paddingDeg,
  }
}
