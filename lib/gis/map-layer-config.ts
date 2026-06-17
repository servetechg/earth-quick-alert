import {
  ALL_GIS_FILTER_LAYERS,
  OPERATIONAL_MAP_LAYERS,
  type GisFilterLayerDef,
} from '@/lib/gis/gis-filter-layers'
import { CRITICAL_INFRASTRUCTURE_SECTORS } from '@/lib/gis/critical-infrastructure-sectors'
import { AlertTriangle } from 'lucide-react'

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
  return defaults
}
