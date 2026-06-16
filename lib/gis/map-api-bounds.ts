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
  const west = Number(url.searchParams.get('west'))
  const south = Number(url.searchParams.get('south'))
  const east = Number(url.searchParams.get('east'))
  const north = Number(url.searchParams.get('north'))
  if ([west, south, east, north].every(Number.isFinite) && east > west && north > south) {
    return { west, south, east, north }
  }

  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  const radius = Number(url.searchParams.get('radius')) || 35_000
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return radiusBounds(lat, lng, radius)
  }

  return null
}
