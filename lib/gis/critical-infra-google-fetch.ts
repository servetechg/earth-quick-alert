import type { CriticalInfraMapMarker } from '@/lib/demo/critical-infrastructure-markers'
import {
  CRITICAL_INFRASTRUCTURE_SECTORS,
  sectorGooglePlaceTypes,
  sectorGoogleTextQueries,
  sectorHasGooglePlaces,
  type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors'
import {
  radiusSearchPlan,
  viewportSearchPlan,
  type MapBounds,
} from '@/lib/gis/infrastructure-search-grid'
import { rankPlacesForViewport } from '@/lib/gis/viewport-place-ranking'
import {
  boundsCenter,
  boundsRadiusMeters,
} from '@/lib/gis/geojson-map-utils'
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config'
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch'
import { pointInUsaBounds } from '@/lib/constants/usa-map-bounds'

/** Keep critical-infra layers readable — Google Places only, capped per viewport. */
const MAX_MARKERS_PER_SECTOR = 32
const MAX_GRID_CELLS = 6
const MAX_TEXT_QUERIES = 1

export type CiGoogleSearchScope =
  | { mode: 'bounds'; bounds: MapBounds }
  | { mode: 'radius'; lat: number; lng: number; radiusMeters: number }

function searchPlanForScope(scope: CiGoogleSearchScope) {
  if (scope.mode === 'bounds') {
    return viewportSearchPlan(scope.bounds)
  }
  const plan = radiusSearchPlan(
    { lat: scope.lat, lng: scope.lng },
    scope.radiusMeters / 1609.34,
  )
  return plan
}

function viewportBoundsForScope(scope: CiGoogleSearchScope): MapBounds | null {
  if (scope.mode === 'bounds') return scope.bounds
  return null
}

type GooglePlaceHit = {
  place_id: string
  name: string
  lat: number
  lng: number
  vicinity: string
  rating?: number
  user_ratings_total?: number
}

function parsePlaceResults(
  results: {
    place_id?: string
    name?: string
    geometry?: { location?: { lat?: number; lng?: number } }
    vicinity?: string
    formatted_address?: string
    rating?: number
    user_ratings_total?: number
  }[] | undefined,
): GooglePlaceHit[] {
  const out: GooglePlaceHit[] = []
  for (const place of results ?? []) {
    const pid = place.place_id
    const plat = place.geometry?.location?.lat
    const plng = place.geometry?.location?.lng
    if (!pid || !Number.isFinite(plat) || !Number.isFinite(plng)) continue
    out.push({
      place_id: pid,
      name: String(place.name ?? 'Place'),
      lat: plat as number,
      lng: plng as number,
      vicinity:
        place.vicinity || place.formatted_address || 'Address not available',
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
    })
  }
  return out
}

async function nearbySearchPage(
  lat: number,
  lng: number,
  type: string,
  radiusM: number,
): Promise<GooglePlaceHit[]> {
  if (!GOOGLE_MAPS_API_KEY) return []

  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radiusM),
    type,
    key: GOOGLE_MAPS_API_KEY,
  })

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`,
  )
  if (!res.ok) return []

  const data = (await res.json()) as {
    status?: string
    results?: {
      place_id?: string
      name?: string
      geometry?: { location?: { lat?: number; lng?: number } }
      vicinity?: string
      formatted_address?: string
      rating?: number
      user_ratings_total?: number
    }[]
  }

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return []
  return parsePlaceResults(data.results)
}

async function textSearchPage(
  query: string,
  lat: number,
  lng: number,
  radiusM: number,
): Promise<GooglePlaceHit[]> {
  if (!GOOGLE_MAPS_API_KEY) return []

  const params = new URLSearchParams({
    query,
    location: `${lat},${lng}`,
    radius: String(radiusM),
    key: GOOGLE_MAPS_API_KEY,
  })

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
  )
  if (!res.ok) return []

  const data = (await res.json()) as {
    status?: string
    results?: {
      place_id?: string
      name?: string
      geometry?: { location?: { lat?: number; lng?: number } }
      vicinity?: string
      formatted_address?: string
      rating?: number
      user_ratings_total?: number
    }[]
  }

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return []
  return parsePlaceResults(data.results)
}

export async function fetchGoogleCriticalInfraMarkers(
  requestedSectors: CriticalInfraSectorId[],
  scope: CiGoogleSearchScope,
): Promise<CriticalInfraMapMarker[]> {
  const markers: CriticalInfraMapMarker[] = []
  const globalSeen = new Set<string>()
  const plan = searchPlanForScope(scope)
  const gridPoints = plan.points.slice(0, MAX_GRID_CELLS)
  const rankBounds = viewportBoundsForScope(scope)

  for (const sectorId of requestedSectors) {
    const sector = CRITICAL_INFRASTRUCTURE_SECTORS.find((s) => s.id === sectorId)
    if (!sector || !sectorHasGooglePlaces(sector)) continue

    const placeTypes = sectorGooglePlaceTypes(sector)
    const textQueries = sectorGoogleTextQueries(sector).slice(0, MAX_TEXT_QUERIES)
    const byPlaceId = new Map<string, InfrastructurePlaceResult>()
    const textOnly = placeTypes.length === 0 && textQueries.length > 0

    for (const type of placeTypes) {
      for (const point of gridPoints) {
        const batch = await nearbySearchPage(point.lat, point.lng, type, plan.radiusM)
        for (const place of batch) {
          if (!byPlaceId.has(place.place_id)) {
            byPlaceId.set(place.place_id, {
              place_id: place.place_id,
              name: place.name,
              placeType: type,
              lat: place.lat,
              lng: place.lng,
              vicinity: place.vicinity,
              rating: place.rating,
              user_ratings_total: place.user_ratings_total,
            })
          }
        }
      }
    }

    if (textQueries.length > 0) {
      const searchCenter =
        rankBounds != null
          ? boundsCenter(rankBounds)
          : gridPoints[0] ?? { lat: 39.8283, lng: -98.5795 }
      const searchRadius =
        rankBounds != null
          ? Math.min(boundsRadiusMeters(rankBounds), 50_000)
          : plan.radiusM

      const textPoints = textOnly ? [searchCenter] : gridPoints.slice(0, 3)

      for (const query of textQueries) {
        for (const point of textPoints) {
          const batch = await textSearchPage(query, point.lat, point.lng, searchRadius)
          for (const place of batch) {
            if (!byPlaceId.has(place.place_id)) {
              byPlaceId.set(place.place_id, {
                place_id: place.place_id,
                name: place.name,
                placeType: sector.id,
                lat: place.lat,
                lng: place.lng,
                vicinity: place.vicinity,
                rating: place.rating,
                user_ratings_total: place.user_ratings_total,
              })
            }
          }
        }
      }
    }

    let ranked = [...byPlaceId.values()]
    if (rankBounds && ranked.length > MAX_MARKERS_PER_SECTOR) {
      ranked = rankPlacesForViewport(ranked, rankBounds).slice(0, MAX_MARKERS_PER_SECTOR)
    } else if (ranked.length > MAX_MARKERS_PER_SECTOR) {
      ranked = ranked
        .sort((a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0))
        .slice(0, MAX_MARKERS_PER_SECTOR)
    }

    for (const place of ranked) {
      if (!pointInUsaBounds(place.lat, place.lng)) continue
      if (globalSeen.has(place.place_id)) continue
      globalSeen.add(place.place_id)
      markers.push({
        id: place.place_id,
        sectorId: sector.id,
        lat: place.lat,
        lng: place.lng,
        title: place.name,
        status: 'unknown',
        location: place.vicinity,
        description: `${sector.label} · Google Maps`,
        riskLevel: 'MODERATE',
      })
    }
  }

  return markers
}
