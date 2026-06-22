import {
  ALL_GIS_FILTER_LAYERS,
  OPERATIONAL_MAP_LAYERS,
  type GisFilterLayerDef,
} from '@/lib/gis/gis-filter-layers'
import { CRITICAL_INFRASTRUCTURE_SECTORS } from '@/lib/gis/critical-infrastructure-sectors'
import { AlertTriangle, Droplets } from 'lucide-react'

export type { GisFilterLayerDef } from '@/lib/gis/gis-filter-layers'

export interface MapLayerDef {
  id: string
  label: string
  Icon: React.ComponentType<any>
  color: string
  isGooglePlace?: boolean
  placeType?: string
  resultType?: string
  markerIcon?: string
}

/** Facilities & resources shown in the GIS Filter dropdown (Google + deployment). */
export const GIS_FILTER_MAP_LAYERS: MapLayerDef[] = ALL_GIS_FILTER_LAYERS.map((layer) => ({
  id: layer.id,
  label: layer.label,
  Icon: layer.Icon,
  color: layer.color,
  isGooglePlace: layer.fetch.mode !== 'deployment',
  placeType: layer.resultType,
  resultType: layer.resultType,
  markerIcon: layer.markerIcon,
}))

/** @deprecated Use GIS_FILTER_MAP_LAYERS */
export const GOOGLE_PLACE_MAP_LAYERS: MapLayerDef[] = GIS_FILTER_MAP_LAYERS

/** @deprecated Use GIS_FILTER_MAP_LAYERS */
export const INFRASTRUCTURE_SUB_LAYERS = GIS_FILTER_MAP_LAYERS

export const TOP_LEVEL_MAP_LAYERS: MapLayerDef[] = [
  ...OPERATIONAL_MAP_LAYERS.map((layer) => ({ ...layer })),
  ...GIS_FILTER_MAP_LAYERS,
]

/** Demo — post-disaster zones A/B/C (Arkansas tornado scenario). */
export const DISASTER_ZONE_LAYER: MapLayerDef = {
  id: 'disaster_zones',
  label: 'Disaster Zones (A/B/C)',
  Icon: AlertTriangle,
  color: '#DC2626',
}

/** Open-source NID dams layer (no Google billing). */
export const DAMS_MAP_LAYER = {
  id: 'dams',
  label: 'Dams',
  Icon: Droplets,
  color: '#E32C28',
  markerIcon: 'dam',
} as const

export function buildDefaultMapLayerState(opts?: {
  includeCriticalInfra?: boolean
  includeDisasterZones?: boolean
}): Record<string, boolean> {
  const defaults: Record<string, boolean> = {}
  TOP_LEVEL_MAP_LAYERS.forEach((layer) => {
    defaults[layer.id] = false
  })
  if (opts?.includeDisasterZones) {
    defaults[DISASTER_ZONE_LAYER.id] = false
  }
  if (opts?.includeCriticalInfra) {
    CRITICAL_INFRASTRUCTURE_SECTORS.forEach((sector) => {
      defaults[sector.id] = false
    })
  }
  defaults[DAMS_MAP_LAYER.id] = false
  return defaults
}

/** Arkansas demo — turn on every infrastructure filter so the presentation map is populated. */
export function buildDemoMapLayerState(opts?: {
  includeCriticalInfra?: boolean
  includeDisasterZones?: boolean
}): Record<string, boolean> {
  const state = buildDefaultMapLayerState(opts)
  GIS_FILTER_MAP_LAYERS.forEach((layer) => {
    state[layer.id] = true
  })
  if (opts?.includeDisasterZones) {
    state[DISASTER_ZONE_LAYER.id] = true
  }
  if (opts?.includeCriticalInfra) {
    CRITICAL_INFRASTRUCTURE_SECTORS.forEach((sector) => {
      state[sector.id] = true
    })
  }
  return state
}
