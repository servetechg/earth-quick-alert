import {
  CloudRain,
  AlertTriangle,
  Waves,
  Home as HomeIcon,
  PlusSquare,
  Construction,
  Zap,
  Droplets,
  Boxes,
  AlertOctagon,
  Flame,
  Siren,
} from 'lucide-react'
import { CRITICAL_INFRASTRUCTURE_SECTORS } from '@/lib/gis/critical-infrastructure-sectors'

export interface MapLayerDef {
  id: string
  label: string
  Icon: React.ComponentType<any>
  color: string
  isGooglePlace?: boolean
  placeType?: string
}

export const TOP_LEVEL_MAP_LAYERS: MapLayerDef[] = [
  { id: 'weather', label: 'Weather Radar', Icon: CloudRain, color: '#3B82F6' },
  { id: 'risk', label: 'Risk Areas', Icon: AlertTriangle, color: '#0EA5E9' },
  { id: 'flood', label: 'Flood Zones', Icon: Waves, color: '#A41E22' },
  { id: 'shelters', label: 'Shelters', Icon: HomeIcon, color: '#16A34A' },
  { id: 'hospitals', label: 'Hospitals', Icon: PlusSquare, color: '#22A9A1' },
  { id: 'roads', label: 'Road Closures', Icon: Construction, color: '#DC2626' },
  { id: 'power', label: 'Power Outages', Icon: Zap, color: '#EAB308' },
  { id: 'water', label: 'Water Issues', Icon: Droplets, color: '#0EA5E9' },
  { id: 'resources', label: 'Resource Sites', Icon: Boxes, color: '#16A34A' },
  { id: 'incidents', label: 'Incident Reports', Icon: AlertOctagon, color: '#DC2626' },
  {
    id: 'fire_station',
    label: 'Emergency Service Providers',
    Icon: Flame,
    color: '#EF4444',
    isGooglePlace: true,
    placeType: 'fire_station',
  },
  {
    id: 'police',
    label: 'Police Stations',
    Icon: Siren,
    color: '#1E3A8A',
    isGooglePlace: true,
    placeType: 'police',
  },
]

/** Demo — post-disaster zones A/B/C (Arkansas tornado scenario). */
export const DISASTER_ZONE_LAYER: MapLayerDef = {
  id: 'disaster_zones',
  label: 'Disaster Zones (A/B/C)',
  Icon: AlertTriangle,
  color: '#DC2626',
}

/** Google Places layers toggled from Map Layers (fire / police). */
export const GOOGLE_PLACE_MAP_LAYERS: MapLayerDef[] = TOP_LEVEL_MAP_LAYERS.filter(
  (layer) => layer.isGooglePlace,
)

/** @deprecated Use GOOGLE_PLACE_MAP_LAYERS */
export const INFRASTRUCTURE_SUB_LAYERS = GOOGLE_PLACE_MAP_LAYERS

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
