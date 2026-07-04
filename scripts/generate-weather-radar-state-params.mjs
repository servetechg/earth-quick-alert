import { writeFileSync } from 'fs'
import { US_STATE_BBOX } from '../lib/constants/us-state-bounding-boxes.ts'

function toMercator(lon, lat) {
  const x = (lon * 20037508.342789244) / 180
  const rad = (lat * Math.PI) / 180
  const y = (Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 20037508.342789244) / Math.PI
  return [x, y]
}

function zoomFromSpan(maxSpanDeg) {
  if (maxSpanDeg > 25) return 4
  if (maxSpanDeg > 15) return 5
  if (maxSpanDeg > 10) return 6
  if (maxSpanDeg > 6) return 7
  if (maxSpanDeg > 3) return 8
  if (maxSpanDeg > 1.5) return 9
  return 10
}

const STATE_NAMES = {
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

const WMS = {
  baseUrl: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi',
  layer: 'nexrad-n0q-900913',
  version: '1.1.1',
  srs: 'EPSG:3857',
  format: 'image/png',
  transparent: true,
  attribution: 'NOAA/NWS NEXRAD via Iowa Environmental Mesonet',
  refreshIntervalSeconds: 300,
  coverageNote:
    'CONUS NEXRAD composite. Alaska, Hawaii, and Puerto Rico have limited or no coverage.',
}

function buildGetMapUrl(bbox3857, w = 256, h = 256) {
  const { xmin, ymin, xmax, ymax } = bbox3857
  const p = new URLSearchParams({
    service: 'WMS',
    request: 'GetMap',
    version: WMS.version,
    layers: WMS.layer,
    styles: '',
    format: WMS.format,
    transparent: String(WMS.transparent),
    height: String(h),
    width: String(w),
    srs: WMS.srs,
    bbox: [xmin, ymin, xmax, ymax].join(','),
  })
  return `${WMS.baseUrl}?${p.toString()}`
}

const conus = [-125, 24, -66, 50]
const [nx1, ny1] = toMercator(conus[0], conus[1])
const [nx2, ny2] = toMercator(conus[2], conus[3])
const nationwideBbox3857 = { xmin: nx1, ymin: ny1, xmax: nx2, ymax: ny2 }

const out = {
  meta: {
    generatedAt: new Date().toISOString().slice(0, 10),
    filterId: 'weather',
    filterLabel: 'Weather Radar',
    mobileFilterId: 'weatherRadar',
    wms: WMS,
    getMapTemplate: `${WMS.baseUrl}?service=WMS&request=GetMap&version=1.1.1&layers=nexrad-n0q-900913&styles=&format=image/png&transparent=true&height={width}&width={width}&srs=EPSG:3857&bbox={xmin},{ymin},{xmax},{ymax}`,
  },
  nationwide: {
    label: 'Continental US',
    center: { lat: 39.5, lng: -98.35 },
    zoom: 4,
    bboxWgs84: { west: conus[0], south: conus[1], east: conus[2], north: conus[3] },
    bboxEpsg3857: nationwideBbox3857,
    sampleGetMapUrl: buildGetMapUrl(nationwideBbox3857, 512, 512),
  },
  states: {},
}

for (const [code, b] of Object.entries(US_STATE_BBOX)) {
  const [west, south, east, north] = b
  let centerLng = (west + east) / 2
  let centerLat = (south + north) / 2
  if (code === 'AK') {
    centerLng = -152
    centerLat = 64
  }
  const span = Math.max(Math.abs(east - west), Math.abs(north - south))
  const sw = toMercator(west, south)
  const ne = toMercator(east, north)
  const bboxEpsg3857 = { xmin: sw[0], ymin: sw[1], xmax: ne[0], ymax: ne[1] }
  out.states[code] = {
    code,
    name: STATE_NAMES[code] ?? code,
    center: { lat: +centerLat.toFixed(6), lng: +centerLng.toFixed(6) },
    zoom: zoomFromSpan(span),
    bboxWgs84: { west, south, east, north },
    bboxEpsg3857,
    sampleGetMapUrl: buildGetMapUrl(bboxEpsg3857, 512, 512),
    radarCoverage: ['HI', 'PR'].includes(code) ? 'none' : code === 'AK' ? 'partial' : 'full',
  }
}

writeFileSync('data/us-weather-radar-state-params.json', JSON.stringify(out, null, 2))
console.log(`Wrote ${Object.keys(out.states).length} states to data/us-weather-radar-state-params.json`)
