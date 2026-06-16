import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'

export type GeoJsonFeature = {
  type?: string
  id?: string | number
  geometry?: {
    type?: string
    coordinates?: unknown
  } | null
  properties?: Record<string, unknown>
}

export type GeoJsonFeatureCollection = {
  type?: string
  features?: GeoJsonFeature[]
}

export function boundsToEnvelope(bounds: MapBounds): string {
  return JSON.stringify({
    xmin: bounds.west,
    ymin: bounds.south,
    xmax: bounds.east,
    ymax: bounds.north,
    spatialReference: { wkid: 4326 },
  })
}

export function geoJsonRingToPath(ring: number[][]): { lat: number; lng: number }[] {
  return ring
    .filter((pt) => Array.isArray(pt) && pt.length >= 2)
    .map((pt) => ({ lat: pt[1], lng: pt[0] }))
}

export function geoJsonToPaths(geometry: unknown): { lat: number; lng: number }[][] {
  if (!geometry || typeof geometry !== 'object') return []
  const g = geometry as { type?: string; coordinates?: unknown }

  if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
    const path = geoJsonRingToPath(g.coordinates as number[][])
    return path.length >= 2 ? [path] : []
  }

  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
    return (g.coordinates as number[][][])
      .map((line) => geoJsonRingToPath(line))
      .filter((line) => line.length >= 2)
  }

  if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
    const ring = geoJsonRingToPath(g.coordinates[0] as number[][])
    if (ring.length < 2) return []
    const closed =
      ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng
    return [closed ? ring : [...ring, ring[0]]]
  }

  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    const paths: { lat: number; lng: number }[][] = []
    for (const poly of g.coordinates as number[][][][]) {
      if (!Array.isArray(poly?.[0])) continue
      const ring = geoJsonRingToPath(poly[0])
      if (ring.length < 2) continue
      const closed =
        ring[0].lat === ring[ring.length - 1].lat && ring[0].lng === ring[ring.length - 1].lng
      paths.push(closed ? ring : [...ring, ring[0]])
    }
    return paths
  }

  return []
}

export function featureCentroid(feature: GeoJsonFeature): { lat: number; lng: number } | null {
  const geometry = feature.geometry
  if (!geometry) {
    const props = feature.properties ?? {}
    const lat = Number(props.LATITUDE83 ?? props.LATITUDE ?? props.lat ?? props.Latitude)
    const lng = Number(
      props.LONGITUDE83 ?? props.LONGITUDE ?? props.lng ?? props.Longitude ?? props.LONGITUDE8,
    )
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    return null
  }

  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    const [lng, lat] = geometry.coordinates as number[]
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }

  const paths = geoJsonToPaths(geometry)
  if (paths.length === 0) return null

  let latSum = 0
  let lngSum = 0
  let count = 0
  for (const path of paths) {
    for (const pt of path) {
      latSum += pt.lat
      lngSum += pt.lng
      count += 1
    }
  }
  if (count === 0) return null
  return { lat: latSum / count, lng: lngSum / count }
}

export function pickFeatureTitle(
  props: Record<string, unknown>,
  titleFields: string[],
  fallback = 'Infrastructure site',
): string {
  for (const field of titleFields) {
    const val = props[field]
    if (val != null && String(val).trim()) return String(val).trim()
  }
  return fallback
}

export function pointInBounds(lat: number, lng: number, bounds: MapBounds): boolean {
  return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north
}

export function radiusBounds(
  lat: number,
  lng: number,
  radiusMeters: number,
): MapBounds {
  const dLat = radiusMeters / 111_320
  const dLng = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180))
  return {
    west: lng - dLng,
    south: lat - dLat,
    east: lng + dLng,
    north: lat + dLat,
  }
}

export function boundsCenter(bounds: MapBounds): { lat: number; lng: number } {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  }
}

/** Approximate radius (m) from bbox center to NE corner — for Google Places nearby fallback. */
export function boundsRadiusMeters(bounds: MapBounds): number {
  const center = boundsCenter(bounds)
  const latM = (bounds.north - center.lat) * 111_320
  const lngM =
    (bounds.east - center.lng) * 111_320 * Math.cos((center.lat * Math.PI) / 180)
  return Math.min(Math.sqrt(latM * latM + lngM * lngM), 50_000)
}
