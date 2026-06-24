import {
  ALL_GIS_FILTER_LAYERS,
  OPERATIONAL_MAP_LAYERS,
  type GisFilterLayerDef,
} from '@/lib/gis/gis-filter-layers'
import {
  CRITICAL_INFRASTRUCTURE_SECTORS,
  type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors'
import { AlertTriangle, Droplets, FlaskConical, Fuel, Home, Landmark } from 'lucide-react'

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

/** Open-source FEMA NSS shelters layer (no Google billing). */
export const SHELTERS_MAP_LAYER = {
  id: 'shelters',
  label: 'Shelters',
  Icon: Home,
  color: '#16A34A',
  markerIcon: 'shelter',
} as const

/** Open-source NREL AFDC fuel sites layer (no Google billing). */
export const FUEL_SITES_MAP_LAYER = {
  id: 'fuel_sites',
  label: 'Fuel Sites',
  Icon: Fuel,
  color: '#D74C30',
  markerIcon: 'fuel',
} as const

/** Mongo-backed EPA FRS chemical (SEMS) — toggled under Critical Infrastructure. */
export const CHEMICAL_SITES_MAP_LAYER = {
  id: 'ci_chemical',
  label: 'Chemical',
  Icon: FlaskConical,
  color: '#7C3AED',
  markerIcon: 'chemical',
} as const

/** Mongo-backed FDIC bank branches — toggled under Critical Infrastructure. */
export const FINANCIAL_SITES_MAP_LAYER = {
  id: 'ci_financial',
  label: 'Financial',
  Icon: Landmark,
  color: '#059669',
  markerIcon: 'financial',
} as const

/** General open-source facility layers — national Mongo ingest complete (52/52 states). */
export const OPEN_SOURCE_MAP_LAYERS = [
  DAMS_MAP_LAYER,
  SHELTERS_MAP_LAYER,
  FUEL_SITES_MAP_LAYER,
] as const

/** CI sectors with Mongo-backed map layers (shown in Filter dropdown). */
export const MONGO_CRITICAL_INFRA_SECTOR_IDS: CriticalInfraSectorId[] = [
  'ci_chemical',
  'ci_financial',
]

/** @deprecated Use MONGO_CRITICAL_INFRA_SECTOR_IDS */
export const IMPLEMENTED_CRITICAL_INFRA_SECTOR_IDS = MONGO_CRITICAL_INFRA_SECTOR_IDS

/** Critical Infrastructure rows shown in the GIS Filter dropdown (implemented only). */
export const IMPLEMENTED_CRITICAL_INFRA_MAP_SECTORS = CRITICAL_INFRASTRUCTURE_SECTORS.filter(
  (s) => MONGO_CRITICAL_INFRA_SECTOR_IDS.includes(s.id),
)

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
    MONGO_CRITICAL_INFRA_SECTOR_IDS.forEach((sectorId) => {
      defaults[sectorId] = false
    })
  }
  defaults[DAMS_MAP_LAYER.id] = false
  defaults[SHELTERS_MAP_LAYER.id] = false
  defaults[FUEL_SITES_MAP_LAYER.id] = false
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
    MONGO_CRITICAL_INFRA_SECTOR_IDS.forEach((sectorId) => {
      state[sectorId] = true
    })
  }
  return state
}
