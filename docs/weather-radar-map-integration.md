# Weather Radar map integration (NEXRAD WMS)

**Audience:** Frontend developers implementing the **Weather Radar** map filter  
**Filter id (web):** `weather` — defined in `lib/gis/gis-filter-layers.ts`  
**Filter id (mobile):** `weatherRadar` — defined in `lib/types/mobile/emergency.ts`  
**Data file:** [`data/us-weather-radar-state-params.json`](../data/us-weather-radar-state-params.json)  
**TypeScript helpers:** [`lib/gis/weather-radar-config.ts`](../lib/gis/weather-radar-config.ts)

---

## 1. What this layer is

Live **NEXRAD base reflectivity** (product **N0Q**) as a transparent PNG overlay on the map.  
Source: Iowa Environmental Mesonet WMS — same nationwide feed for every state.

| Property | Value |
|----------|-------|
| WMS base URL | `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi` |
| Layer name | `nexrad-n0q-900913` (Web Mercator / EPSG:3857) |
| Format | `image/png`, `transparent=true` |
| Update cadence | ~5 minutes |
| Attribution | `NOAA/NWS NEXRAD via Iowa Environmental Mesonet` |

**Important:** There is **one WMS endpoint** for the whole country. Per-state entries in the JSON file are **viewport helpers** (center, zoom, bounding boxes) — not separate radar APIs.

**Coverage caveats**

| Region | `radarCoverage` | Notes |
|--------|-----------------|-------|
| 48 contiguous states + DC | `full` | Primary use case |
| Alaska (`AK`) | `partial` | Limited NEXRAD; use center `64, -152` not raw bbox midpoint |
| Hawaii (`HI`) | `none` | No CONUS composite coverage — hide layer or show “unavailable” |
| Puerto Rico (`PR`) | `none` | Same as HI |

---

## 2. WMS GetMap parameters

Your example tile request decomposed:

```
GET https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi
  ?service=WMS
  &request=GetMap
  &version=1.1.1
  &layers=nexrad-n0q-900913
  &styles=
  &format=image/png
  &transparent=true
  &height=256
  &width=256
  &srs=EPSG:3857
  &bbox={xmin},{ymin},{xmax},{ymax}
```

| Param | Required | Description |
|-------|----------|-------------|
| `service` | yes | `WMS` |
| `request` | yes | `GetMap` |
| `version` | yes | `1.1.1` |
| `layers` | yes | `nexrad-n0q-900913` |
| `styles` | yes | empty string |
| `format` | yes | `image/png` |
| `transparent` | yes | `true` |
| `width` / `height` | yes | tile size in pixels (256 typical) |
| `srs` | yes | `EPSG:3857` |
| `bbox` | yes | `xmin,ymin,xmax,ymax` in **meters** (Web Mercator) |

### Coordinate systems

| System | Used for | Example (Arkansas center) |
|--------|----------|---------------------------|
| **WGS84** (`lat`, `lng`) | Leaflet `center`, `fitBounds`, Google Maps | `34.751853, -92.131157` |
| **EPSG:3857** (`x`, `y` meters) | WMS `bbox` only | see `bboxEpsg3857` in JSON |

Convert lat/lng → EPSG:3857:

```ts
import { latLngToEpsg3857, wgs84BboxToEpsg3857 } from '@/lib/gis/weather-radar-config'

const { x, y } = latLngToEpsg3857(34.75, -92.13)
```

---

## 3. Per-state viewport params

Full table: [`data/us-weather-radar-state-params.json`](../data/us-weather-radar-state-params.json)

Each state entry includes:

```json
{
  "code": "AR",
  "name": "Arkansas",
  "center": { "lat": 34.751853, "lng": -92.131157 },
  "zoom": 8,
  "bboxWgs84": { "west": -94.617919, "south": 33.004106, "east": -89.644395, "north": 36.4996 },
  "bboxEpsg3857": { "xmin": -10532818.56, "ymin": 3895848.98, "xmax": -9979168.40, "ymax": 4369585.12 },
  "sampleGetMapUrl": "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/...",
  "radarCoverage": "full"
}
```

### Quick reference — sample states

| Code | Center (lat, lng) | Zoom | Coverage |
|------|-------------------|------|----------|
| **US (nationwide)** | 39.5, -98.35 | 4 | full |
| AR | 34.75, -92.13 | 8 | full |
| CA | 37.27, -119.27 | 6 | full |
| FL | 27.76, -83.83 | 7 | full |
| NY | 42.76, -75.81 | 7 | full |
| TX | 31.17, -100.08 | 6 | full |
| AK | 64.0, -152.0 | 4 | partial |
| HI | 23.66, -166.57 | 5 | none |
| PR | 18.20, -66.58 | 9 | none |

Use `getWeatherRadarStateViewport(scopeState)` from `weather-radar-config.ts` when `scopeState` is passed from admin / EOC views.

---

## 4. Recommended implementation (Leaflet / react-leaflet)

The app already uses Leaflet in `components/situational-leaflet-map.tsx`. **Do not** hand-build per-tile `bbox` URLs unless you must — use WMS tile layer support.

### 4.1 Toggle wiring

```ts
// mapLayers.weather === true  →  show radar overlay
// Filter label in UI: "Weather Radar"
```

When the user enables **Weather Radar**:

1. Add the WMS overlay above the base map tiles.
2. Optionally `flyTo` state center when `scopeState` is set.
3. Refresh tiles every 5 minutes (or on pan end) so new scans appear.

### 4.2 Leaflet WMS overlay (recommended)

```tsx
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  NEXRAD_WMS,
  NEXRAD_LEAFLET_WMS_OPTIONS,
  NEXRAD_WMS as wms,
} from '@/lib/gis/weather-radar-config'

export function WeatherRadarWmsLayer({ enabled }: { enabled: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (!enabled) return

    const layer = L.tileLayer.wms(NEXRAD_WMS.baseUrl, {
      ...NEXRAD_LEAFLET_WMS_OPTIONS,
      // cache-bust so ~5 min updates show up
      cacheBust: Date.now(),
    })

    layer.addTo(map)

    const refresh = window.setInterval(() => {
      layer.setParams({ _t: Date.now() })
    }, NEXRAD_WMS.refreshIntervalMs)

    return () => {
      window.clearInterval(refresh)
      map.removeLayer(layer)
    }
  }, [enabled, map])

  return null
}
```

Mount inside `MapContainer` when `mapLayers.weather` is true:

```tsx
{mapLayers.weather && <WeatherRadarWmsLayer enabled />}
```

### 4.3 State-scoped flyTo

```ts
import { getWeatherRadarStateViewport } from '@/lib/gis/weather-radar-config'

function focusRadarViewport(map: L.Map, scopeState?: string) {
  const vp = getWeatherRadarStateViewport(scopeState)
  if ('radarCoverage' in vp && vp.radarCoverage === 'none') return

  if ('bboxWgs84' in vp && 'zoom' in vp && 'center' in vp) {
    const { west, south, east, north } = vp.bboxWgs84
    map.fitBounds(
      [
        [south, west],
        [north, east],
      ],
      { padding: [24, 24], maxZoom: vp.zoom },
    )
  }
}
```

---

## 5. Manual GetMap URL (debug / static preview)

For a **single state image** (e.g. thumbnail or QA), use `buildNexradGetMapUrl`:

```ts
import stateParams from '@/data/us-weather-radar-state-params.json'
import { buildNexradGetMapUrl } from '@/lib/gis/weather-radar-config'

const ar = stateParams.states.AR
const url = buildNexradGetMapUrl({
  bboxEpsg3857: ar.bboxEpsg3857,
  width: 512,
  height: 512,
  cacheBuster: Date.now(),
})
```

Or copy `sampleGetMapUrl` directly from the JSON file.

**Arkansas example (your bbox region):**

```
https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi
  ?service=WMS&request=GetMap&version=1.1.1
  &layers=nexrad-n0q-900913&styles=&format=image/png&transparent=true
  &height=256&width=256&srs=EPSG:3857
  &bbox=-10532818.56,3895848.98,-9979168.40,4369585.12
```

---

## 6. React Native / Mapbox / Google Maps

### Mapbox GL (`ImageSource` or raster)

Use the nationwide or state `bboxWgs84` for geographic bounds. Fetch a GetMap PNG (512×512 or larger) and bind:

```ts
const vp = stateParams.states.TX
const url = buildNexradGetMapUrl({ bboxEpsg3857: vp.bboxEpsg3857, width: 1024, height: 1024 })

// coordinates: [top-left, top-right, bottom-right, bottom-left]
const { west, south, east, north } = vp.bboxWgs84
const coordinates = [
  [west, north],
  [east, north],
  [east, south],
  [west, south],
]
```

Refresh `url` every 5 minutes when the Weather Radar layer is on.

### Google Maps (`GroundOverlay`)

```ts
const { west, south, east, north } = vp.bboxWgs84
new google.maps.GroundOverlay(url, { north, south, east, west })
```

---

## 7. UX checklist

- [ ] Filter toggle id is `weather` (web) / `weatherRadar` (mobile).
- [ ] Overlay opacity ~0.6–0.7 so base map stays readable.
- [ ] Show attribution in map corner.
- [ ] Auto-refresh tiles every **5 min** while layer is enabled.
- [ ] When `scopeState` is set, frame map to that state’s `bboxWgs84`.
- [ ] For `radarCoverage: "none"` (HI, PR), disable toggle or show tooltip.
- [ ] Layer stacks **above** base tiles, **below** markers / polygons.

---

## 8. Regenerating state params

If state bounding boxes change in `lib/constants/us-state-bounding-boxes.ts`:

```bash
node scripts/generate-weather-radar-state-params.mjs
```

This refreshes `data/us-weather-radar-state-params.json`.

---

## 9. Related code (repo)

| File | Purpose |
|------|---------|
| `lib/gis/gis-filter-layers.ts` | `Weather Radar` filter definition (`id: 'weather'`) |
| `lib/gis/map-layer-config.ts` | Note: radar overlay implementation deferred |
| `components/situational-leaflet-map.tsx` | Leaflet map host |
| `components/gis-map.tsx` | Filter state `mapLayers.weather` |
| `lib/constants/us-state-bounding-boxes.ts` | Source WGS84 envelopes |

---

## 10. Test URLs

Open in a browser to verify the feed returns a PNG:

- **Single tile (256×256):** use any `sampleGetMapUrl` from the JSON.
- **GetCapabilities:**  
  `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi?service=WMS&request=GetCapabilities`

If you see a radar image with green/yellow/red echoes, the integration is correct.
