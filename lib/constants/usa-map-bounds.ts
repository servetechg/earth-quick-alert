import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'
import { intersectBounds } from '@/lib/gis/infrastructure-search-grid'

/** Default nationwide map viewport — continental US (matches legacy center 37°N, 95°W @ zoom 4). */
export const CONUS_MAP_BOUNDS: MapBounds = {
  west: -125,
  south: 24.5,
  east: -66.5,
  north: 49.5,
}

const ALASKA_MAP_BOUNDS: MapBounds = {
  west: -171.5,
  south: 51.2,
  east: -129.5,
  north: 71.5,
}

const HAWAII_MAP_BOUNDS: MapBounds = {
  west: -161.0,
  south: 18.88,
  east: -154.6,
  north: 22.45,
}

const PUERTO_RICO_MAP_BOUNDS: MapBounds = {
  west: -67.95,
  south: 17.86,
  east: -65.22,
  north: 18.52,
}

/** CONUS + AK + HI + PR — excludes Mexico, Canada, and other neighbors. */
const USA_REGION_BOUNDS: MapBounds[] = [
  CONUS_MAP_BOUNDS,
  ALASKA_MAP_BOUNDS,
  HAWAII_MAP_BOUNDS,
  PUERTO_RICO_MAP_BOUNDS,
]

/** Union envelope (approximate) — prefer region checks over this box. */
export const USA_MAP_BOUNDS: MapBounds = {
  west: -171.8,
  south: 17.8,
  east: -64.5,
  north: 71.5,
}

function pointInBox(lat: number, lng: number, box: MapBounds): boolean {
  return lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north
}

export function pointInUsaBounds(lat: number, lng: number): boolean {
  return USA_REGION_BOUNDS.some((box) => pointInBox(lat, lng, box))
}

/** True when the map viewport intersects any US region (CONUS, AK, HI, PR). */
export function boundsOverlapUsa(bounds: MapBounds): boolean {
  return USA_REGION_BOUNDS.some((region) => intersectBounds(bounds, region) != null)
}

function boundsCenter(bounds: MapBounds): { lat: number; lng: number } {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lng: (bounds.west + bounds.east) / 2,
  }
}

/**
 * Viewport is "in the US" when its center lies inside a US region.
 * Stricter than boundsOverlapUsa — avoids showing US data while panning over Mexico/Canada
 * when the viewport still clips the southern/northern US border.
 */
export function viewportCenterInUsa(bounds: MapBounds): boolean {
  const center = boundsCenter(bounds)
  return pointInUsaBounds(center.lat, center.lng)
}

/** Clip viewport to the largest overlapping US region; null if fully outside the US. */
export function clampBoundsToUsa(bounds: MapBounds): MapBounds | null {
  let best: MapBounds | null = null
  let bestArea = 0
  for (const region of USA_REGION_BOUNDS) {
    const clip = intersectBounds(bounds, region)
    if (!clip) continue
    const area = (clip.east - clip.west) * (clip.north - clip.south)
    if (area > bestArea) {
      best = clip
      bestArea = area
    }
  }
  return best
}

/** Super-admin with no state drill-down — nationwide USA view only. */
export function isSuperAdminNationwideView(
  role: string,
  scopeState?: string | null,
): boolean {
  return role === 'super-admin' && !String(scopeState ?? '').trim()
}

export function filterLatLngInUsa<T extends { lat: number; lng: number }>(items: T[]): T[] {
  return items.filter((item) => pointInUsaBounds(item.lat, item.lng))
}
