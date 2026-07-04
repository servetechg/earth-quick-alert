import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes'

/** Map filter toggle id — see `OPERATIONAL_MAP_LAYERS` in `gis-filter-layers.ts`. */
export const WEATHER_RADAR_FILTER_ID = 'weather' as const

/** Mobile map layer id — see `lib/types/mobile/emergency.ts`. */
export const WEATHER_RADAR_MOBILE_LAYER_ID = 'weatherRadar' as const

export const NEXRAD_WMS = {
  baseUrl: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi',
  layer: 'nexrad-n0q-900913',
  version: '1.1.1',
  srs: 'EPSG:3857',
  format: 'image/png',
  transparent: true,
  attribution: 'NOAA/NWS NEXRAD via Iowa Environmental Mesonet',
  /** Composite updates about every 5 minutes. */
  refreshIntervalMs: 5 * 60 * 1000,
} as const

export type WeatherRadarBboxWgs84 = {
  west: number
  south: number
  east: number
  north: number
}

/** Restrict NEXRAD overlay to sub-admin license (state envelope or radius circle). */
export type WeatherRadarMapScope =
  | { mode: 'free' }
  | { mode: 'state'; bounds: WeatherRadarBboxWgs84 }
  | {
      mode: 'radius'
      center: { lat: number; lng: number }
      radiusMeters: number
      bounds: WeatherRadarBboxWgs84
    }

export type WeatherRadarBboxEpsg3857 = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

export type WeatherRadarStateViewport = {
  code: string
  name: string
  center: { lat: number; lng: number }
  zoom: number
  bboxWgs84: WeatherRadarBboxWgs84
  bboxEpsg3857: WeatherRadarBboxEpsg3857
  radarCoverage: 'full' | 'partial' | 'none'
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  PR: 'Puerto Rico',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

/** WGS84 lat/lng → Web Mercator meters (EPSG:3857). */
export function latLngToEpsg3857(lat: number, lng: number): { x: number; y: number } {
  const x = (lng * 20037508.342789244) / 180
  const rad = (lat * Math.PI) / 180
  const y = (Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 20037508.342789244) / Math.PI
  return { x, y }
}

/** WGS84 envelope corners → EPSG:3857 bbox for WMS `bbox`. */
export function wgs84BboxToEpsg3857(bbox: WeatherRadarBboxWgs84): WeatherRadarBboxEpsg3857 {
  const sw = latLngToEpsg3857(bbox.south, bbox.west)
  const ne = latLngToEpsg3857(bbox.north, bbox.east)
  return { xmin: sw.x, ymin: sw.y, xmax: ne.x, ymax: ne.y }
}

function zoomFromSpan(maxSpanDeg: number): number {
  if (maxSpanDeg > 25) return 4
  if (maxSpanDeg > 15) return 5
  if (maxSpanDeg > 10) return 6
  if (maxSpanDeg > 6) return 7
  if (maxSpanDeg > 3) return 8
  if (maxSpanDeg > 1.5) return 9
  return 10
}

function radarCoverageForState(code: string): 'full' | 'partial' | 'none' {
  if (code === 'HI' || code === 'PR') return 'none'
  if (code === 'AK') return 'partial'
  return 'full'
}

/** False when CONUS NEXRAD composite has no usable coverage for the scoped state. */
export function isWeatherRadarAvailableForScope(stateCode?: string | null): boolean {
  const code = String(stateCode ?? '')
    .trim()
    .toUpperCase()
  if (!code) return true
  return radarCoverageForState(code) !== 'none'
}

function buildStateViewport(code: string): WeatherRadarStateViewport {
  const bbox = US_STATE_BBOX[code]
  if (!bbox) throw new Error(`Unknown state: ${code}`)
  const [west, south, east, north] = bbox
  let centerLng = (west + east) / 2
  let centerLat = (south + north) / 2
  if (code === 'AK') {
    centerLng = -152
    centerLat = 64
  }
  const bboxWgs84 = { west, south, east, north }
  const span = Math.max(Math.abs(east - west), Math.abs(north - south))
  return {
    code,
    name: STATE_NAMES[code] ?? code,
    center: { lat: +centerLat.toFixed(6), lng: +centerLng.toFixed(6) },
    zoom: zoomFromSpan(span),
    bboxWgs84,
    bboxEpsg3857: wgs84BboxToEpsg3857(bboxWgs84),
    radarCoverage: radarCoverageForState(code),
  }
}

/** Per-state map viewport for framing radar when `scopeState` is set. */
export const WEATHER_RADAR_STATE_VIEWPORTS: Record<string, WeatherRadarStateViewport> =
  Object.fromEntries(Object.keys(US_STATE_BBOX).map((code) => [code, buildStateViewport(code)]))

export const WEATHER_RADAR_NATIONWIDE_VIEWPORT = {
  label: 'Continental US',
  center: { lat: 39.5, lng: -98.35 },
  zoom: 4,
  bboxWgs84: { west: -125, south: 24, east: -66, north: 50 },
  bboxEpsg3857: wgs84BboxToEpsg3857({ west: -125, south: 24, east: -66, north: 50 }),
} as const

export function getWeatherRadarStateViewport(
  stateCode: string | null | undefined,
): WeatherRadarStateViewport | typeof WEATHER_RADAR_NATIONWIDE_VIEWPORT {
  const code = String(stateCode ?? '')
    .trim()
    .toUpperCase()
  if (!code) return WEATHER_RADAR_NATIONWIDE_VIEWPORT
  return WEATHER_RADAR_STATE_VIEWPORTS[code] ?? WEATHER_RADAR_NATIONWIDE_VIEWPORT
}

export type BuildNexradGetMapUrlOpts = {
  bboxEpsg3857: WeatherRadarBboxEpsg3857
  width?: number
  height?: number
  /** Append `&_t={cacheBuster}` so browsers refresh tiles. */
  cacheBuster?: number | string
}

/** Build a single WMS GetMap image URL (one tile or state snapshot). */
export function buildNexradGetMapUrl(opts: BuildNexradGetMapUrlOpts): string {
  const { xmin, ymin, xmax, ymax } = opts.bboxEpsg3857
  const width = opts.width ?? 256
  const height = opts.height ?? 256
  const params = new URLSearchParams({
    service: 'WMS',
    request: 'GetMap',
    version: NEXRAD_WMS.version,
    layers: NEXRAD_WMS.layer,
    styles: '',
    format: NEXRAD_WMS.format,
    transparent: String(NEXRAD_WMS.transparent),
    width: String(width),
    height: String(height),
    srs: NEXRAD_WMS.srs,
    bbox: [xmin, ymin, xmax, ymax].join(','),
  })
  let url = `${NEXRAD_WMS.baseUrl}?${params.toString()}`
  if (opts.cacheBuster != null) {
    url += `&_t=${encodeURIComponent(String(opts.cacheBuster))}`
  }
  return url
}

/** Leaflet `L.tileLayer.wms` options for the Weather Radar overlay. */
export const NEXRAD_LEAFLET_WMS_OPTIONS = {
  layers: NEXRAD_WMS.layer,
  format: NEXRAD_WMS.format,
  transparent: true,
  version: NEXRAD_WMS.version,
  attribution: NEXRAD_WMS.attribution,
  opacity: 0.65,
}
