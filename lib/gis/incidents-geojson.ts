import type { MapBounds } from '@/lib/gis/infrastructure-search-grid'
import { pointInBounds, type GeoJsonFeatureCollection } from '@/lib/gis/geojson-map-utils'
import IncidentReport from '@/models/IncidentReport'

export type IncidentMapType = 'Power Outage' | 'Water Main Leak' | 'Road Closure' | 'Downed Tree' | 'Other'

export interface IncidentGeoFeature {
  id: string
  type: string
  lat: number
  lng: number
  title: string
  location: string
  description: string
  status: string
  reportedBy: string
  source: string
  createdAt: string
}

function incidentTitle(doc: {
  type: string
  description?: string
  location: string
}): string {
  if (doc.description?.trim()) return `${doc.type} — ${doc.description.trim()}`
  return `${doc.type} @ ${doc.location}`
}

export async function fetchIncidentsAsGeoFeatures(opts?: {
  types?: string[]
  bounds?: MapBounds | null
  limit?: number
}): Promise<IncidentGeoFeature[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500)
  const types = opts?.types?.filter(Boolean)

  const query: Record<string, unknown> = {}
  if (types?.length) {
    query.type = { $in: types }
  }

  const docs = await IncidentReport.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()

  const out: IncidentGeoFeature[] = []
  for (const raw of docs) {
    const doc = raw as {
      _id: { toString(): string }
      type: string
      location: string
      lat?: number
      lng?: number
      description?: string
      reportedBy: string
      source?: string
      status: string
      createdAt: Date
    }

    const lat = Number(doc.lat)
    const lng = Number(doc.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (opts?.bounds && !pointInBounds(lat, lng, opts.bounds)) continue

    out.push({
      id: doc._id.toString(),
      type: doc.type,
      lat,
      lng,
      title: incidentTitle(doc),
      location: doc.location,
      description: doc.description ?? '',
      status: doc.status,
      reportedBy: doc.reportedBy,
      source: doc.source ?? 'End User',
      createdAt: doc.createdAt.toISOString(),
    })
  }

  return out
}

export function incidentsToGeoJson(features: IncidentGeoFeature[]): GeoJsonFeatureCollection {
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
        type: f.type,
        title: f.title,
        location: f.location,
        description: f.description,
        status: f.status,
        reportedBy: f.reportedBy,
        source: f.source,
        createdAt: f.createdAt,
      },
    })),
  }
}

export function resolveIncidentTypesFromFilter(filter: string): string[] | undefined {
  const key = filter.trim().toLowerCase()
  if (!key || key === 'all' || key === 'incidents') return undefined
  if (key === 'power' || key === 'power_outage' || key === 'power-outages') {
    return ['Power Outage']
  }
  if (key === 'water' || key === 'water_issues' || key === 'water-main') {
    return ['Water Main Leak']
  }
  if (key === 'roads' || key === 'road_closure') {
    return ['Road Closure']
  }
  return [filter]
}
