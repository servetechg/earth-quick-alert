import {
  ALL_GIS_FILTER_LAYERS,
  OPERATIONAL_MAP_LAYERS,
  type GisFilterLayerDef,
} from '@/lib/gis/gis-filter-layers'
import { HIFLD_OPERATIONAL_MAP_LAYERS } from '@/lib/gis/hifld-operational-layers'
import {
  CRITICAL_INFRASTRUCTURE_SECTORS,
  type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors'
import { AlertTriangle, Construction, Droplets, FlaskConical, Fuel, Home, Landmark, Pill, Server, Siren, UtensilsCrossed, Users, Zap, Boxes } from 'lucide-react'

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
  isGooglePlace:
    layer.fetch.mode === 'google_nearby' ||
    layer.fetch.mode === 'google_text' ||
    layer.fetch.mode === 'google_composite',
  placeType: layer.resultType,
  resultType: layer.resultType,
  markerIcon: layer.markerIcon,
}))

export const TOP_LEVEL_MAP_LAYERS: MapLayerDef[] = [
  ...OPERATIONAL_MAP_LAYERS.map((layer) => ({ ...layer })),
  ...GIS_FILTER_MAP_LAYERS,
]

/** NWS alert polygon layers shown in the map Filter dropdown (weather radar deferred). */
export const ALERT_ZONE_MAP_LAYERS: MapLayerDef[] = OPERATIONAL_MAP_LAYERS.filter(
  (layer) => layer.id === 'risk' || layer.id === 'flood',
).map((layer) => ({ ...layer }))

/** Real-time DOT work zones (WZDX). */
export const ROAD_CLOSURES_MAP_LAYER: MapLayerDef = {
  id: 'roads',
  label: 'Road Closures',
  Icon: Construction,
  color: '#DC2626',
  markerIcon: 'road_closure',
}

/** Demo — post-disaster zones A/B/C (Arkansas tornado scenario). */
export const DISASTER_ZONE_LAYER: MapLayerDef = {
  id: 'disaster_zones',
  label: 'Disaster Zones (A/B/C)',
  Icon: AlertTriangle,
  color: '#DC2626',
}

/** NID dams — toggled under Critical Infrastructure (`ci_dams`). */
export const DAMS_MAP_LAYER = {
  id: 'ci_dams',
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

/** Mongo-backed US pharmacy locations (Google Places text search ingest). */
export const PHARMACIES_MAP_LAYER = {
  id: 'pharmacies',
  label: 'Pharmacies',
  Icon: Pill,
  color: '#10B981',
  markerIcon: 'pharmacy',
} as const

/** Mongo-backed US police stations (Google Places text search ingest). */
export const POLICE_STATIONS_MAP_LAYER = {
  id: 'police',
  label: 'Police Stations',
  Icon: Siren,
  color: '#1E3A8A',
  markerIcon: 'police',
} as const

/** Mongo-backed US food distribution / Meals Ready locations. */
export const MEALS_READY_MAP_LAYER = {
  id: 'meals_ready',
  label: 'Meals Ready',
  Icon: UtensilsCrossed,
  color: '#D74C30',
  markerIcon: 'meals',
} as const

/** Mongo-backed US generator rental / supplier locations. */
export const GENERATORS_MAP_LAYER = {
  id: 'generators',
  label: 'Generators',
  Icon: Zap,
  color: '#E5A436',
  markerIcon: 'generator',
} as const

/** Mongo-backed US volunteer coordination centers. */
export const VOLUNTEERS_MAP_LAYER = {
  id: 'volunteers',
  label: 'Volunteers',
  Icon: Users,
  color: '#5C7E2D',
  markerIcon: 'volunteers',
} as const

/** Mongo-backed US emergency resource sites (Google Places text search ingest). */
export const RESOURCE_SITES_MAP_LAYER = {
  id: 'resources',
  label: 'Resource Sites',
  Icon: Boxes,
  color: '#16A34A',
  markerIcon: 'resource',
} as const

/** Mongo-backed US information technology infrastructure locations. */
export const IT_INFRASTRUCTURE_MAP_LAYER = {
  id: 'ci_it',
  label: 'Information Technology (IT)',
  Icon: Server,
  color: '#8B5CF6',
  markerIcon: 'it',
} as const

/** HIFLD Next situational facility layers (hospitals, fire/EMS). */
export { HIFLD_OPERATIONAL_MAP_LAYERS }

/** General open-source facility layers — national Mongo ingest complete (52/52 states). */
export const OPEN_SOURCE_MAP_LAYERS = [
  SHELTERS_MAP_LAYER,
  FUEL_SITES_MAP_LAYER,
  PHARMACIES_MAP_LAYER,
  POLICE_STATIONS_MAP_LAYER,
  MEALS_READY_MAP_LAYER,
  GENERATORS_MAP_LAYER,
  VOLUNTEERS_MAP_LAYER,
  RESOURCE_SITES_MAP_LAYER,
  IT_INFRASTRUCTURE_MAP_LAYER,
] as const

/** HIFLD Next sectors available on the map (Mongo and/or live fallback). */
export const HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS: CriticalInfraSectorId[] = [
  'ci_chemical',
  'ci_healthcare',
  'ci_emergency_services',
  'ci_energy',
  'ci_nuclear',
  'ci_transportation',
  'ci_water',
  'ci_defense',
  'ci_manufacturing',
  'ci_communications',
  'ci_commercial',
  'ci_food_ag',
  'ci_government',
]

/** HIFLD-backed chemical (RMP + SEMS) — toggled under Critical Infrastructure. */
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

/** CI sectors with Mongo-backed map layers (shown in Filter dropdown). */
export const MONGO_CRITICAL_INFRA_SECTOR_IDS: CriticalInfraSectorId[] = [
  'ci_dams',
  'ci_financial',
  ...HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS,
]

export type InfrastructureClusterMode =
  | 'default'
  | 'dams'
  | 'shelters'
  | 'fuel'
  | 'pharmacies'
  | 'police'
  | 'meals'
  | 'generators'
  | 'volunteers'
  | 'resources'
  | 'it'
  | 'chemical'
  | 'financial'
  | 'roads'
  | 'critical-infra'

/** Match open-source facility clustering (dams / shelters / fuel) for active map layer. */
export function resolveInfrastructureClusterMode(
  mapLayers: Record<string, boolean>,
): InfrastructureClusterMode {
  if (mapLayers.ci_dams) return 'dams'
  if (mapLayers.roads) return 'roads'
  if (mapLayers.shelters) return 'shelters'
  if (mapLayers.fuel_sites) return 'fuel'
  if (mapLayers.pharmacies) return 'pharmacies'
  if (mapLayers.police) return 'police'
  if (mapLayers.meals_ready) return 'meals'
  if (mapLayers.generators) return 'generators'
  if (mapLayers.volunteers) return 'volunteers'
  if (mapLayers.resources) return 'resources'
  if (mapLayers.ci_it) return 'it'
  if (mapLayers.ci_chemical) return 'chemical'
  if (mapLayers.ci_financial) return 'financial'
  if (HIFLD_NEXT_IMPLEMENTED_SECTOR_IDS.some((id) => mapLayers[id])) return 'critical-infra'
  if (HIFLD_OPERATIONAL_MAP_LAYERS.some((layer) => mapLayers[layer.id])) return 'critical-infra'
  return 'default'
}

/** SVG marker icon id for Mongo-backed CI sectors (glyph used when undefined). */
export function criticalInfraSectorMarkerIcon(sectorId: CriticalInfraSectorId): string | undefined {
  if (sectorId === 'ci_chemical') return CHEMICAL_SITES_MAP_LAYER.markerIcon
  if (sectorId === 'ci_financial') return FINANCIAL_SITES_MAP_LAYER.markerIcon
  if (sectorId === 'ci_dams') return DAMS_MAP_LAYER.markerIcon
  return undefined
}


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
  defaults.risk = true
  if (opts?.includeDisasterZones) {
    defaults[DISASTER_ZONE_LAYER.id] = false
  }
  if (opts?.includeCriticalInfra) {
    MONGO_CRITICAL_INFRA_SECTOR_IDS.forEach((sectorId) => {
      defaults[sectorId] = false
    })
  }
  HIFLD_OPERATIONAL_MAP_LAYERS.forEach((layer) => {
    defaults[layer.id] = false
  })
  defaults[SHELTERS_MAP_LAYER.id] = false
  defaults[FUEL_SITES_MAP_LAYER.id] = false
  defaults[PHARMACIES_MAP_LAYER.id] = false
  defaults[POLICE_STATIONS_MAP_LAYER.id] = false
  defaults[MEALS_READY_MAP_LAYER.id] = false
  defaults[GENERATORS_MAP_LAYER.id] = false
  defaults[VOLUNTEERS_MAP_LAYER.id] = false
  defaults[RESOURCE_SITES_MAP_LAYER.id] = false
  defaults[IT_INFRASTRUCTURE_MAP_LAYER.id] = false
  defaults[ROAD_CLOSURES_MAP_LAYER.id] = false
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
  OPEN_SOURCE_MAP_LAYERS.forEach((layer) => {
    state[layer.id] = true
  })
  HIFLD_OPERATIONAL_MAP_LAYERS.forEach((layer) => {
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
  state[ROAD_CLOSURES_MAP_LAYER.id] = true
  return state
}
