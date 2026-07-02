import {
  CloudRain,
  AlertTriangle,
  Waves,
  Zap,
  Droplets,
  Boxes,
  AlertOctagon,
  UtensilsCrossed,
  Users,
  Server,
  type LucideIcon,
} from 'lucide-react'

/** How a GIS filter layer resolves its map markers. */
export type GisFilterFetchKind =
  | { mode: 'google_nearby'; placeType: string }
  | { mode: 'google_text'; query: string }
  | {
      mode: 'google_composite'
      placeType: string
      textQuery: string
      /** Additional Google Nearby `type` values merged into the same layer. */
      extraNearbyTypes?: string[]
    }
  | { mode: 'deployment'; deployment: DeploymentResourceKind }
  | { mode: 'mongo' }

export type DeploymentResourceKind =
  | 'power_crews'
  | 'water_crews'
  | 'fuel_sites'
  | 'generators'
  | 'volunteers'
  | 'meals_ready'

export interface GisFilterLayerDef {
  id: string
  label: string
  Icon: LucideIcon
  color: string
  fetch: GisFilterFetchKind
  /** API / marker placeType key */
  resultType: string
  markerIcon: string
}

/** Layers backed by Mongo static place datasets (no live Google billing). */
export const MONGO_GIS_FILTER_LAYERS: GisFilterLayerDef[] = [
  {
    id: 'generators',
    label: 'Generators',
    Icon: Zap,
    color: '#E5A436',
    fetch: { mode: 'mongo' },
    resultType: 'generator',
    markerIcon: 'generator',
  },
  {
    id: 'meals_ready',
    label: 'Meals Ready',
    Icon: UtensilsCrossed,
    color: '#D74C30',
    fetch: { mode: 'mongo' },
    resultType: 'meals_ready',
    markerIcon: 'meals',
  },
  {
    id: 'volunteers',
    label: 'Volunteers',
    Icon: Users,
    color: '#5C7E2D',
    fetch: { mode: 'mongo' },
    resultType: 'volunteers',
    markerIcon: 'volunteers',
  },
  {
    id: 'ci_it',
    label: 'Information Technology (IT)',
    Icon: Server,
    color: '#8B5CF6',
    fetch: { mode: 'mongo' },
    resultType: 'it_infrastructure',
    markerIcon: 'it',
  },
]

/** Layers backed by Google Places or text search. */
export const GOOGLE_GIS_FILTER_LAYERS: GisFilterLayerDef[] = []

export const DEPLOYMENT_GIS_FILTER_LAYERS: GisFilterLayerDef[] = [
  {
    id: 'power_crews',
    label: 'Power Crews',
    Icon: Zap,
    color: '#A99423',
    fetch: { mode: 'deployment', deployment: 'power_crews' },
    resultType: 'power_crews',
    markerIcon: 'power_crew',
  },
  {
    id: 'water_crews',
    label: 'Water Crews',
    Icon: Droplets,
    color: '#4674C6',
    fetch: { mode: 'deployment', deployment: 'water_crews' },
    resultType: 'water_crews',
    markerIcon: 'water_crew',
  },
]

export const ALL_GIS_FILTER_LAYERS: GisFilterLayerDef[] = [
  ...MONGO_GIS_FILTER_LAYERS,
  ...GOOGLE_GIS_FILTER_LAYERS,
  ...DEPLOYMENT_GIS_FILTER_LAYERS,
]

const layerById = new Map(ALL_GIS_FILTER_LAYERS.map((l) => [l.id, l]))
const layerByResultType = new Map(ALL_GIS_FILTER_LAYERS.map((l) => [l.resultType, l]))

export function gisFilterLayerById(id: string): GisFilterLayerDef | undefined {
  return layerById.get(id)
}

export function gisFilterLayerByResultType(type: string): GisFilterLayerDef | undefined {
  return layerByResultType.get(type)
}

export function resolveEnabledFilterLayers(layerIds: string[]): GisFilterLayerDef[] {
  const out: GisFilterLayerDef[] = []
  const seen = new Set<string>()
  for (const raw of layerIds) {
    const key = raw.trim()
    if (!key) continue

    let layer = layerById.get(key) ?? layerByResultType.get(key)
    if (!layer) {
      layer = ALL_GIS_FILTER_LAYERS.find(
        (l) => l.fetch.mode === 'google_nearby' && l.fetch.placeType === key,
      )
    }
    if (!layer || seen.has(layer.resultType)) continue
    seen.add(layer.resultType)
    out.push(layer)
  }
  return out
}

/** Non-GIS operational layers (weather, incidents, etc.) */
export const OPERATIONAL_MAP_LAYERS = [
  { id: 'weather', label: 'Weather Radar', Icon: CloudRain, color: '#3B82F6' },
  { id: 'risk', label: 'Risk Areas', Icon: AlertTriangle, color: '#0EA5E9' },
  { id: 'flood', label: 'Flood Zones', Icon: Waves, color: '#A41E22' },
  { id: 'power', label: 'Power Outages', Icon: Zap, color: '#EAB308' },
  { id: 'water', label: 'Water Issues', Icon: Droplets, color: '#0EA5E9' },
  { id: 'resources', label: 'Resource Sites', Icon: Boxes, color: '#16A34A' },
  { id: 'incidents', label: 'Incident Reports', Icon: AlertOctagon, color: '#DC2626' },
] as const
