import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'
import {
  featureCentroid,
  geoJsonToPaths,
  pointInBounds,
  type GeoJsonFeature,
  type GeoJsonFeatureCollection,
} from '@/lib/gis/geojson-map-utils'
import { isFloodRelatedEvent } from '@/lib/services/risk-ingest-service'

const NWS_ALERTS = 'https://api.weather.gov/alerts/active'

const USER_AGENT =
  process.env.NWS_USER_AGENT ||
  'Ready2Go-EmergencyOps/1.0 (+https://localhost; ops@agency.local; map-alerts)'

export type NwsAlertCategory = 'weather' | 'flood' | 'risk' | 'all'

export interface NwsAlertMapFeature {
  id: string
  event: string
  headline: string
  severity: string
  urgency: string
  areaDesc: string
  sent?: string
  effective?: string
  expires?: string
  description?: string
  instruction?: string
  paths: { lat: number; lng: number }[][]
  centroid: { lat: number; lng: number } | null
  category: NwsAlertCategory
}

function nwsHeaders(): HeadersInit {
  return {
    Accept: 'application/geo+json, application/json',
    'User-Agent': USER_AGENT,
  }
}

function isRiskAlert(event: string): boolean {
  const e = event.toLowerCase()
  return (
    e.includes('tornado') ||
    e.includes('severe thunderstorm') ||
    e.includes('hurricane') ||
    e.includes('typhoon') ||
    e.includes('winter storm') ||
    e.includes('ice storm') ||
    e.includes('blizzard') ||
    e.includes('extreme heat') ||
    e.includes('extreme cold') ||
    e.includes('fire weather') ||
    e.includes('red flag')
  )
}

function categorizeAlert(event: string): NwsAlertCategory {
  if (isFloodRelatedEvent(event)) return 'flood'
  if (isRiskAlert(event)) return 'risk'
  return 'weather'
}

function matchesCategory(category: NwsAlertCategory, event: string): boolean {
  if (category === 'all') return true
  const cat = categorizeAlert(event)
  if (category === 'weather') return cat === 'weather'
  return cat === category
}

function featureInBounds(feature: GeoJsonFeature, bounds: MapBounds): boolean {
  const paths = geoJsonToPaths(feature.geometry)
  if (paths.length > 0) {
    return paths.some((path) => path.some((pt) => pointInBounds(pt.lat, pt.lng, bounds)))
  }
  const centroid = featureCentroid(feature)
  if (!centroid) return true
  return pointInBounds(centroid.lat, centroid.lng, bounds)
}

export async function fetchNwsActiveAlerts(opts?: {
  stateCode?: string | null
  bounds?: MapBounds | null
  category?: NwsAlertCategory
}): Promise<NwsAlertMapFeature[]> {
  const category = opts?.category ?? 'all'
  const state = opts?.stateCode?.trim().toUpperCase()
  const url = state
    ? `${NWS_ALERTS}?status=actual&area=${encodeURIComponent(state)}`
    : `${NWS_ALERTS}?status=actual`

  const res = await fetch(url, { headers: nwsHeaders(), signal: AbortSignal.timeout(45_000) })
  if (!res.ok) {
    throw new Error(`NWS alerts fetch failed (${res.status})`)
  }

  const data = (await res.json()) as GeoJsonFeatureCollection
  const out: NwsAlertMapFeature[] = []
  const seen = new Set<string>()

  for (const feature of data.features ?? []) {
    const props = feature.properties ?? {}
    const event = String(props.event ?? 'Weather Alert')
    if (String(props.status ?? '').toLowerCase() === 'test') continue
    if (!matchesCategory(category, event)) continue
    if (opts?.bounds && !featureInBounds(feature as GeoJsonFeature, opts.bounds)) continue

    const id = String(feature.id ?? props.id ?? props['@id'] ?? event).slice(0, 200)
    if (seen.has(id)) continue
    seen.add(id)

    const paths = geoJsonToPaths(feature.geometry)
    const centroid = featureCentroid(feature as GeoJsonFeature)

    out.push({
      id,
      event,
      headline: String(props.headline ?? event),
      severity: String(props.severity ?? 'Unknown'),
      urgency: String(props.urgency ?? 'Unknown'),
      areaDesc: String(props.areaDesc ?? ''),
      sent: props.sent ? String(props.sent) : undefined,
      effective: props.effective ? String(props.effective) : undefined,
      expires: props.expires ? String(props.expires) : undefined,
      description: props.description ? String(props.description).slice(0, 2000) : undefined,
      instruction: props.instruction ? String(props.instruction).slice(0, 1000) : undefined,
      paths,
      centroid,
      category: categorizeAlert(event),
    })
  }

  return out
}

export function nwsAlertsToGeoJson(alerts: NwsAlertMapFeature[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: alerts.map((a) => ({
      type: 'Feature',
      id: a.id,
      geometry:
        a.paths[0]?.length
          ? {
              type: 'Polygon',
              coordinates: [a.paths[0].map((p) => [p.lng, p.lat])],
            }
          : a.centroid
            ? { type: 'Point', coordinates: [a.centroid.lng, a.centroid.lat] }
            : null,
      properties: {
        event: a.event,
        headline: a.headline,
        severity: a.severity,
        urgency: a.urgency,
        areaDesc: a.areaDesc,
        category: a.category,
        sent: a.sent,
        effective: a.effective,
        expires: a.expires,
      },
    })),
  }
}
