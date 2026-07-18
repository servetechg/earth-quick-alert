import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'
import { radiusBounds } from '@/lib/gis/geojson-map-utils'

export function parseMapBounds(raw: unknown): MapBounds | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const west = Number(b.west)
  const south = Number(b.south)
  const east = Number(b.east)
  const north = Number(b.north)
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return null
  }
  if (east <= west || north <= south) return null
  return { west, south, east, north }
}

export function boundsFromQuery(url: URL): MapBounds | null {
  const westRaw = url.searchParams.get('west')
  const southRaw = url.searchParams.get('south')
  const eastRaw = url.searchParams.get('east')
  const northRaw = url.searchParams.get('north')

  // Require explicit params — Number(null) === 0 and would invent a bogus bbox.
  if (westRaw != null && southRaw != null && eastRaw != null && northRaw != null) {
    const west = Number(westRaw)
    const south = Number(southRaw)
    const east = Number(eastRaw)
    const north = Number(northRaw)
    if (
      [west, south, east, north].every(Number.isFinite) &&
      east > west &&
      north > south
    ) {
      return { west, south, east, north }
    }
  }

  const latRaw = url.searchParams.get('lat')
  const lngRaw = url.searchParams.get('lng')
  if (latRaw != null && lngRaw != null) {
    const lat = Number(latRaw)
    const lng = Number(lngRaw)
    const radius = Number(url.searchParams.get('radius')) || 35_000
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return radiusBounds(lat, lng, radius)
    }
  }

  return null
}
