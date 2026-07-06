import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Building2, type LucideIcon } from 'lucide-react'
import { OPERATIONAL_MAP_LAYERS } from '@/lib/gis/gis-filter-layers'
import { CRITICAL_INFRASTRUCTURE_SECTORS } from '@/lib/gis/critical-infrastructure-sectors'
import { HIFLD_OPERATIONAL_MAP_LAYERS } from '@/lib/gis/hifld-operational-layers'
import {
  CHEMICAL_SITES_MAP_LAYER,
  DAMS_MAP_LAYER,
  FINANCIAL_SITES_MAP_LAYER,
  FUEL_SITES_MAP_LAYER,
  GENERATORS_MAP_LAYER,
  IT_INFRASTRUCTURE_MAP_LAYER,
  MEALS_READY_MAP_LAYER,
  PHARMACIES_MAP_LAYER,
  POLICE_STATIONS_MAP_LAYER,
  POWER_OUTAGES_MAP_LAYER,
  RESOURCE_SITES_MAP_LAYER,
  ROAD_CLOSURES_MAP_LAYER,
  SHELTERS_MAP_LAYER,
  VOLUNTEERS_MAP_LAYER,
} from '@/lib/gis/map-layer-config'

type MarkerIconLayer = { markerIcon?: string; label: string; Icon: unknown }

/**
 * Single source of truth so map markers + cluster badges use the SAME lucide
 * icon shown for each category in the Filter dropdown.
 */
const LAYERS_WITH_MARKER_ICON: MarkerIconLayer[] = [
  SHELTERS_MAP_LAYER,
  FUEL_SITES_MAP_LAYER,
  PHARMACIES_MAP_LAYER,
  POLICE_STATIONS_MAP_LAYER,
  MEALS_READY_MAP_LAYER,
  GENERATORS_MAP_LAYER,
  VOLUNTEERS_MAP_LAYER,
  RESOURCE_SITES_MAP_LAYER,
  IT_INFRASTRUCTURE_MAP_LAYER,
  DAMS_MAP_LAYER,
  CHEMICAL_SITES_MAP_LAYER,
  FINANCIAL_SITES_MAP_LAYER,
  ROAD_CLOSURES_MAP_LAYER,
  POWER_OUTAGES_MAP_LAYER,
]

const byMarkerIcon = new Map<string, LucideIcon>()
const byCategoryLabel = new Map<string, LucideIcon>()

for (const layer of LAYERS_WITH_MARKER_ICON) {
  if (layer?.markerIcon) byMarkerIcon.set(layer.markerIcon, layer.Icon as LucideIcon)
  if (layer?.label) byCategoryLabel.set(layer.label, layer.Icon as LucideIcon)
}

for (const layer of HIFLD_OPERATIONAL_MAP_LAYERS) {
  byMarkerIcon.set(layer.markerIcon, layer.Icon)
  byCategoryLabel.set(layer.label, layer.Icon)
}

for (const layer of OPERATIONAL_MAP_LAYERS) {
  byCategoryLabel.set(layer.label, layer.Icon as LucideIcon)
}

for (const sector of CRITICAL_INFRASTRUCTURE_SECTORS) {
  byCategoryLabel.set(sector.label, sector.Icon)
  byCategoryLabel.set(sector.shortLabel, sector.Icon)
}

/** Generic amber "critical infrastructure" cluster (mixed sectors). */
byMarkerIcon.set('critical_infra', Building2)

/** Resolve the dropdown lucide icon for a marker or cluster category. */
export function resolveGlyphIcon(
  iconId?: string | null,
  categoryLabel?: string | null,
): LucideIcon | null {
  if (iconId && byMarkerIcon.has(iconId)) return byMarkerIcon.get(iconId)!
  if (categoryLabel && byCategoryLabel.has(categoryLabel)) {
    return byCategoryLabel.get(categoryLabel)!
  }
  return null
}

const svgCache = new Map<string, string>()

/** White lucide glyph as an inline SVG string (cached per icon + size). */
export function lucideGlyphSvg(Icon: LucideIcon, sizePx: number): string {
  const name = (Icon as { displayName?: string }).displayName ?? Icon.name ?? 'icon'
  const key = `${name}-${sizePx}`
  const cached = svgCache.get(key)
  if (cached) return cached
  const markup = renderToStaticMarkup(
    createElement(Icon, {
      size: sizePx,
      color: '#ffffff',
      strokeWidth: 2.5,
      absoluteStrokeWidth: true,
    }),
  )
  svgCache.set(key, markup)
  return markup
}
