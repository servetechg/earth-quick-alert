import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/cache-store'
import {
  boundsToEnvelope,
  featureCentroid,
  pickFeatureTitle,
  pointInBounds,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
} from '@/lib/gis/geojson-map-utils'
import type { HifldLayerSource } from '@/lib/gis/hifld-infrastructure-sources'

export interface HifldMapFeature {
  id: string
  lat: number
  lng: number
  title: string
  status: string
  location: string
  properties: Record<string, unknown>
  source: string
  geometryType?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const HIFLD_PREFIX = 'hifld:'

function cacheKey(layerUrl: string, where: string, bounds: MapBounds | null): string {
  const b = bounds
    ? `${bounds.west.toFixed(3)},${bounds.south.toFixed(3)},${bounds.east.toFixed(3)},${bounds.north.toFixed(3)}`
    : 'national'
  return `${layerUrl}|${where}|${b}`
}

function buildQueryUrl(
  layer: HifldLayerSource,
  bounds: MapBounds | null,
  limit: number,
): string {
  const where = layer.where?.trim() || '1=1'
  const params = new URLSearchParams({
    where,
    outFields: '*',
    f: 'geojson',
    resultRecordCount: String(Math.min(Math.max(limit, 1), 2000)),
    outSR: '4326',
  })

  if (bounds) {
    params.set('geometry', boundsToEnvelope(bounds))
    params.set('geometryType', 'esriGeometryEnvelope')
    params.set('inSR', '4326')
    params.set('spatialRel', 'esriSpatialRelIntersects')
  }

  return `${layer.layerUrl}/query?${params.toString()}`
}

function featureLocation(props: Record<string, unknown>): string {
  const city = props.CITY ?? props.CITY_NAME ?? props.CWP_CITY
  const state = props.STATE ?? props.STATE_CODE ?? props.CWP_STATE
  const parts = [city, state].filter((v) => v != null && String(v).trim())
  if (parts.length) return parts.map(String).join(', ')
  const addr = props.ADDRESS ?? props.LOCATION_ADDRESS ?? props.LOCATION_A ?? props.CWP_STREET
  return addr ? String(addr) : 'United States'
}

function normalizeStatus(props: Record<string, unknown>, statusField?: string): string {
  if (statusField && props[statusField] != null) return String(props[statusField])
  if (props.STATUS != null) return String(props.STATUS)
  if (props.ACTIVE_STATUS != null) return String(props.ACTIVE_STATUS)
  return 'Active'
}

export async function fetchHifldLayerFeatures(
  layer: HifldLayerSource,
  opts?: { bounds?: MapBounds | null; limit?: number },
): Promise<HifldMapFeature[]> {
  const bounds = opts?.bounds ?? null
  const limit = opts?.limit ?? 500
  const where = layer.where?.trim() || '1=1'
  const key = `${HIFLD_PREFIX}${cacheKey(layer.layerUrl, where, bounds)}`
  const hit = await cacheGetJson<HifldMapFeature[]>(key)
  if (hit) return hit

  const url = buildQueryUrl(layer, bounds, limit)
  const res = await fetch(url, {
    headers: { Accept: 'application/geo+json, application/json' },
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    throw new Error(`HIFLD fetch failed (${res.status}) for ${layer.layerUrl}`)
  }

  const data = (await res.json()) as GeoJsonFeatureCollection
  const features: HifldMapFeature[] = []
  const seen = new Set<string>()

  for (const feature of data.features ?? []) {
    const centroid = featureCentroid(feature)
    if (!centroid) continue
    if (bounds && !pointInBounds(centroid.lat, centroid.lng, bounds)) continue

    const props = feature.properties ?? {}
    const title = pickFeatureTitle(props, layer.titleFields)
    const id = String(
      feature.id ??
        props.OBJECTID ??
        props.REGISTRY_ID ??
        props.ID ??
        `${title}-${centroid.lat.toFixed(5)}-${centroid.lng.toFixed(5)}`,
    )
    if (seen.has(id)) continue
    seen.add(id)

    features.push({
      id,
      lat: centroid.lat,
      lng: centroid.lng,
      title,
      status: normalizeStatus(props, layer.statusField),
      location: featureLocation(props),
      properties: props,
      source: layer.sourceLabel,
      geometryType: feature.geometry?.type,
    })
  }

  await cacheSetJson(key, features, CACHE_TTL_MS)
  return features
}

export async function fetchHifldFilterFeatures(
  layers: HifldLayerSource[],
  opts?: { bounds?: MapBounds | null; limit?: number },
): Promise<HifldMapFeature[]> {
  const merged: HifldMapFeature[] = []
  const seen = new Set<string>()

  for (const layer of layers) {
    try {
      const batch = await fetchHifldLayerFeatures(layer, opts)
      for (const f of batch) {
        const dedupe = `${f.title}|${f.lat.toFixed(4)}|${f.lng.toFixed(4)}`
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        merged.push(f)
      }
    } catch (err) {
      console.warn(`HIFLD layer skipped (${layer.layerUrl}):`, err)
    }
  }

  return merged
}

export function hifldFeaturesToGeoJson(features: HifldMapFeature[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      id: f.id,
      geometry: {
        type: 'Point',
        coordinates: [f.lng, f.lat],
      },
      properties: {
        id: f.id,
        title: f.title,
        status: f.status,
        location: f.location,
        source: f.source,
        ...f.properties,
      },
    })),
  }
}

export function geoJsonToHifldFeatures(collection: GeoJsonFeatureCollection): HifldMapFeature[] {
  const out: HifldMapFeature[] = []
  for (const feature of collection.features ?? []) {
    const centroid = featureCentroid(feature as GeoJsonFeature)
    if (!centroid) continue
    const props = feature.properties ?? {}
    out.push({
      id: String(feature.id ?? props.id ?? `feature-${out.length}`),
      lat: centroid.lat,
      lng: centroid.lng,
      title: pickFeatureTitle(props, ['title', 'name', 'NAME', 'PRIMARY_NAME']),
      status: String(props.status ?? 'Active'),
      location: String(props.location ?? ''),
      properties: props,
      source: String(props.source ?? 'geojson'),
      geometryType: feature.geometry?.type,
    })
  }
  return out
}
