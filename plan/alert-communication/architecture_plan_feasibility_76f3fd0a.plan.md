---
name: EarthquakeAlert Full Pipeline
overview: "Detailed Ready2Go-aligned architecture: APIs → streaming ingestion (Redis Pub/Sub event bus) → normalization (UnifiedEvent with event_type, severity_score, geo_coordinates, confidence_level) → scoring → openaiService → dashboard. Fuse hydrology/wildfire feeds with weather (NOAA NWPS, Open-Meteo/OpenWeather in-repo, optional Tomorrow.io), future 911/call-intake, and GIS layers. Repo paths use root lib/ and kebab-case services."
todos:
  - id: phase-1-services
    content: "Phase 1 — flood-service, wildfire-service (extend index/barrel optional)"
    status: completed
  - id: phase-2-streaming
    content: "Phase 2 — Streaming ingestion: connectors publish normalized batches to Redis channel ready2go:events:raw; worker-safe fetch (no Next-only in-memory as sole store)"
    status: completed
  - id: phase-3-4
    content: "Phase 3–4 — lib/normalization + lib/scoring (UnifiedEvent fields locked for fusion)"
    status: completed
  - id: phase-5-bridge
    content: "Phase 5 — alert-bridge + merge/cross-cut with alert-processor weather/quake + fused signals"
    status: completed
  - id: phase-fusion
    content: "Fusion — Normalize supplemental feeds into same UnifiedEvent constraints; adapters for Tomorrow.io, 911/intake (stub/contracts), GIS overlays"
    status: pending
  - id: phase-6-realtime
    content: "Phase 6 — Stream processor subscribes → score → runAIPipeline → Mongo persist → Socket.IO emit dashboard:update"
    status: completed
  - id: phase-7-ui
    content: "Phase 7 — AlertCard + Socket.IO client + maps"
    status: completed
isProject: false
---

# EarthquakeAlert — Full System Architecture (Ready2Go / detailed)

### Data pipeline

**APIs / connectors → streaming ingestion → normalization → scoring → `OpenAIService` → dashboard**

Phase-by-phase implementation guide, built around existing [`lib/services/openai-service.ts`](lib/services/openai-service.ts). This document supersedes short feasibility notes: it is the **detailed** canonical plan for **earthquick**, with **Ready2Go** constraints applied.

---

## Table of contents

- [Ready2Go positioning](#ready2go-positioning)
- [System overview](#system-overview)
- [Phase 0 — existing foundation](#phase-0--existing-foundation)
- [Phase 1 — API integration layer](#phase-1--api-integration-layer)
- [Phase 2 — streaming ingestion layer](#phase-2--streaming-ingestion-layer-not-batch-only)
- [Phase 3 — normalization engine](#phase-3--normalization-engine)
- [Phase 4 — event scoring](#phase-4--event-scoring-system)
- [Phase 5 — connect to OpenAIService](#phase-5--connect-to-openaiservice)
- [Fusion layer — weather, 911, GIS](#fusion-layer--weather-911-intake-gis)
- [Phase 6 — real-time pipeline](#phase-6--real-time-pipeline)
- [Phase 7 — dashboard UI](#phase-7--dashboard-ui-layer)
- [Folder structure (this repo)](#folder-structure-this-repo)
- [Quick reference](#quick-reference)

---

## Ready2Go positioning

Ready2Go is **event-based** with **real-time infra** (not batch SaaS cron as the only story). Therefore this plan **requires**:

| Principle | Implication |
|-----------|-------------|
| **Streaming ingestion** | Connectors **publish normalized event batches** to an internal **event bus** (Redis Pub/Sub as a lightweight stand-in for Kafka). Avoid a single Node **`Map`** as the only system of record across horizontally scaled servers. |
| **Normalized core record** | Every feed maps into **`UnifiedEvent`** with at minimum: **`event_type`**, **`severity_score`**, **`geo_coordinates`**, **`confidence_level`** (plus metadata below). |
| **Fusion** | Hydrology/wildfire pipelines **fuse** with **weather** signals (NOAA product APIs, Open-Meteo / OpenWeather patterns already in [`lib/services/weather-api.ts`](lib/services/weather-api.ts)), optional **Tomorrow.io**, **911 / call-intake** structured signals (contracts first), and **GIS layers** (zones, perimeters, evacuation polygons). |

Batch polling may still exist **inside** connector workers as a **transport** to fetch upstream APIs; the **architecture** is streaming **because** each poll immediately **normalizes and publishes** to the bus rather than ending in an ephemeral serverless heap.

---

## System overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DATA SOURCES & FUSION INPUTS                                             │
│                                                                          │
│  [ NASA FIRMS ] [ USGS Water ] [ NOAA NWPS ] [ InciWeb ] [ ArcGIS ]     │
│  [ Weather / NWS-style alerts ] [ Open-Meteo ] [ Tomorrow.io optional ] │
│  [ 911 / intake adapters ] [ GIS layers ]                               │
│                              │                                           │
│                              ▼                                           │
│                  ┌─────────────────────────┐                             │
│                  │ CONNECTORS (streaming)  │  Phase 1 + 2               │
│                  │ fetch → normalize →     │                            │
│                  │ PUBLISH (event bus)       │                            │
│                  └────────────┬──────────────┘                             │
│                               │                                          │
│                               ▼                                          │
│                  ┌─────────────────────────┐                             │
│                  │ NORMALIZATION ENGINE     │  Phase 3                   │
│                  │ UnifiedEvent schema      │                            │
│                  └────────────┬─────────────┘                             │
│                               │                                          │
│                               ▼                                          │
│                  ┌─────────────────────────┐                             │
│                  │ EVENT SCORING          │  Phase 4                     │
│                  └────────────┬─────────────┘                             │
│                               │                                          │
│                               ▼                                          │
│                  ┌─────────────────────────┐                             │
│                  │ OpenAIService           │  Phase 5                     │
│                  └────────────┬─────────────┘                             │
│                               │                                          │
│                               ▼                                          │
│                  ┌─────────────────────────┐                             │
│                  │ DASHBOARD + realtime    │  Phase 6–7                   │
│                  └─────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0 — existing foundation

No new code for Phase 0. Existing capabilities in **`OpenAIService`** include:

| Method | Role |
|--------|------|
| `generateThreatAssessment(location, weatherData, earthquakeData)` | Structured risk summary |
| `generateEmergencyInsights(weatherData, earthquakeData)` | All Clear / Warning / Emergency |
| `detectOperationalSignals(...)` | EOC-style escalation hints |
| `generatePreparednessTips(location, weatherData)` | Location-aware tips |
| `splitAlertsBySource(alerts)` | Partition alerts |

**Gap:** upstream hazard fusion feeds must populate the structured inputs; **`alertProcessor`** ([`lib/services/alert-processor.ts`](lib/services/alert-processor.ts)) already aggregates earthquakes, weather-style alerts, community alerts, etc. New hydrology/wildfire streams should **merge** with that model over time.

---

## Phase 1 — API integration layer

Implement **one concern per module** under [`lib/services/`](lib/services/).

### Repo mapping (not `src/lib`)

| Doc name | This repo |
|----------|-----------|
| `floodService.ts` | [`lib/services/flood-service.ts`](lib/services/flood-service.ts) — `getUSGSData`, `getNOAAForecast` |
| `wildfireService.ts` | [`lib/services/wildfire-service.ts`](lib/services/wildfire-service.ts) — `getFIRMSData`, `getInciWebData`, `getArcGISFires` |

**Implementation notes**

- **USGS** instantaneous values: `parameterCd=00065` (gage height) unless product requires otherwise.
- **FIRMS:** requires `NASA_FIRMS_MAP_KEY`; CSV parsing stays server-side.
- **InciWeb:** use **`fast-xml-parser`** in Node (do not rely on `DOMParser` in workers).

---

## Phase 2 — streaming ingestion layer (not batch-only)

### Intent

- **Connectors** run on a schedule or continuous loop in a **worker process** (not inside a stateless serverless function as the only deployment mode).
- After **`normalizeAll(...)`**, publish JSON to Redis: **`ready2go:events:raw`** (or equivalent channel constant in [`lib/constants/ready2go-stream.ts`](lib/constants/ready2go-stream.ts) once added).

### Polling intervals (as connector cadence)

Connectors may still **wake up** on timers; the **architecture** is streaming because **output** is **publish-to-bus**, not “store only in process memory.”

| Source | Suggested cadence | Notes |
|--------|-------------------|--------|
| USGS | ~15 min | Gauge IV refresh bands |
| NOAA NWPS | ~60 min | Model/product dependent |
| FIRMS | ~10 min | Satellite pass |
| InciWeb | ~5 min | Official incident RSS |
| ArcGIS | ~30 min | Perimeter less volatile |

### Pseudocode: connector → bus

```typescript
// lib/ingestion/ingestion-scheduler.ts (conceptual)
import { getUSGSData } from '@/lib/services/flood-service';
import { getFIRMSData, getInciWebData } from '@/lib/services/wildfire-service';
import { normalizeAll } from '@/lib/normalization/normalizer';
import { publishRawEvents } from '@/lib/services/redis'; // wraps redis.publish

export function startIngestionScheduler() {
  void pollUSGS();
  void pollFIRMS();
  void pollInciWeb();
  setInterval(() => void pollUSGS(), 15 * 60 * 1000);
  setInterval(() => void pollFIRMS(), 10 * 60 * 1000);
  setInterval(() => void pollInciWeb(), 5 * 60 * 1000);
}

async function pollUSGS() {
  const raw = await getUSGSData(['01646500', '01638500']);
  const events = normalizeAll({ usgs: raw });
  await publishRawEvents(events);
}
```

### Optional local/dev `eventStore`

An in-memory [`lib/store/event-store.ts`](lib/store/event-store.ts) is acceptable **only** for single-process dev or tests — **not** as production truth. Production persistence is **MongoDB** (append snapshots) + **Redis** for transport/cache as designed in Phase 6.

---

## Phase 3 — normalization engine

### Core type — fields required for fusion

```typescript
// lib/normalization/types.ts

export type EventType = 'flood' | 'wildfire' | 'earthquake';

export type ConfidenceLevel = 'low' | 'nominal' | 'high';

export type AlertLevel = 'normal' | 'watch' | 'warning' | 'emergency';

export interface UnifiedEvent {
  event_id: string;
  event_type: EventType;
  source_api: string;
  alert_level: AlertLevel;
  severity_score: number; // 0–100 after normalization pass; rescored in Phase 4
  geo_coordinates: {
    lat: number;
    lon: number;
    bbox?: [number, number, number, number];
  };
  confidence_level: ConfidenceLevel;
  title: string;
  description: string;
  raw_data: unknown;
  ingested_at: string;
  valid_at: string;
}
```

### Normalizer hub

- [`lib/normalization/normalizer.ts`](lib/normalization/normalizer.ts) — `normalizeAll({ usgs?, firms?, inciweb? })`
- Per-source modules: `normalize-usgs.ts`, `normalize-firms.ts`, `normalize-inciweb.ts`

Use **`crypto.randomUUID()`** for `event_id` (avoid adding `uuid` package unless team prefers).

---

## Phase 4 — event scoring system

[`lib/scoring/event-scorer.ts`](lib/scoring/event-scorer.ts) — `scoreEvent`, `scoreAll`: combine raw `severity_score`, **confidence_level**, and **recency** (`valid_at`), then re-derive `alert_level`.

---

## Phase 5 — connect to OpenAIService

[`lib/bridge/alert-bridge.ts`](lib/bridge/alert-bridge.ts):

- Map **`UnifiedEvent` → `Alert`** with valid discriminated fields ([`lib/types/api-alerts.ts`](lib/types/api-alerts.ts)); avoid bare `as Alert` without required union fields.
- **`runAIPipeline(location, events)`** calls `openaiService.generateEmergencyInsights`, `generateThreatAssessment`, `detectOperationalSignals`, `generatePreparednessTips` with **flood vs wildfire** slices passed into the existing `(weatherData, earthquakeData)` slots **as structured JSON** (prompt wording may be generalized later).

Import path: **`@/lib/services/openai-service`** — export **`openaiService`**.

### Example API route

[`app/api/hazard-dashboard/route.ts`](app/api/hazard-dashboard/route.ts) (name flexible): load recent events from **Mongo** or last snapshot service — **not** from global in-memory store in production.

---

## Fusion layer — weather, 911 intake, GIS

All fused outputs **must** land in the same **`UnifiedEvent`** contract (or a documented extension with **`source_api`** + **`raw_data`**).

### Weather

| Source | Role |
|--------|------|
| **NOAA NWPS / USGS** | Hydrology + structured products (already partially in flood stack). |
| **Open-Meteo / OpenWeather-style** | Current conditions and alerts; [`lib/services/weather-api.ts`](lib/services/weather-api.ts) is the integration anchor. |
| **Tomorrow.io** | Optional premium grid/alerts — add `lib/services/tomorrow-io-service.ts` when keys exist; normalize into `UnifiedEvent` with `event_type` as appropriate (often **`wildfire`** context via wind/humidity or **`flood`** via rainfall accumulation — product-dependent). |

### 911 / call intake

- Define **contract-first** schemas (e.g. CAD webhook → normalized **`UnifiedEvent`** with `source_api: 'call_intake'`).
- Start with **stub adapter + queue** until vendor feeds exist.

### GIS layers

- Fuse **point/polygon** intersections: evacuation zones, fire perimeter layers (ArcGIS already a Phase 1 fetch), static hazard zones.
- Store geometry references in **`raw_data`** or a linked Mongo document; keep **`geo_coordinates`** as representative point or centroid for cards/maps.

---

## Phase 6 — real-time pipeline

**Processor** subscribes to **`ready2go:events:raw`**:

1. `JSON.parse` → `UnifiedEvent[]`
2. `scoreAll`
3. Filter (e.g. `severity_score >= 50`) for AI noise control
4. `runAIPipeline`
5. **Persist** batch to Mongo (new model e.g. `HazardStreamBatch`)
6. **`io.emit('dashboard:update', { events, aiInsights })`** on Socket.IO gateway (dedicated Node worker or custom server — not assumed inside Vercel-only functions)

High severity may also emit **`alert:critical`**.

**Env:** `REDIS_URL`, `STREAM_PORT`, optional `NEXT_PUBLIC_SOCKET_URL` for the browser.

---

## Phase 7 — dashboard UI layer

- Map **`alert_level`** to card chrome (config object as in original guide).
- **`AlertCard`** component: props **`UnifiedEvent`**, format time via `valid_at`.
- Client: `socket.io-client` to **`NEXT_PUBLIC_SOCKET_URL`**.

---

## Folder structure (this repo)

There is **no** top-level `src/` — use **`lib/`** and **`app/`**.

```
app/
  api/
    hazard-dashboard/route.ts    ← GET aggregated hazard + AI (example)
lib/
  services/
    flood-service.ts
    wildfire-service.ts
    weather-api.ts               ← fusion anchor (existing)
    openai-service.ts
    redis.ts                     ← publish/subscribe clients
  ingestion/
    ingestion-scheduler.ts
  store/
    event-store.ts               ← dev-only optional
  normalization/
    types.ts
    normalizer.ts
    sources/
      normalize-usgs.ts
      normalize-firms.ts
      normalize-inciweb.ts
  scoring/
    event-scorer.ts
  bridge/
    alert-bridge.ts
  processing/
    stream-processor.ts
  constants/
    ready2go-stream.ts           ← channel names
server/
  workers/                       ← optional: tsx entrypoints for ingest + stream gateway
models/
  HazardStreamBatch.ts           ← optional persistence model
components/
  hazard/
    alert-card.tsx               ← or components/alert-card.tsx
```

---

## Quick reference

### Phase checklist

| Phase | Task | Primary artifacts |
|-------|------|-------------------|
| 0 | Foundation | `openai-service`, `alert-processor`, `api-alerts` types |
| 1 | API services | `flood-service`, `wildfire-service` |
| 2 | Streaming ingestion | `ingestion-scheduler`, `redis` publish, worker entry |
| 3 | Normalization | `UnifiedEvent`, `normalizer`, source modules |
| 4 | Scoring | `event-scorer` |
| 5 | AI bridge | `alert-bridge`, API route |
| Fusion | Weather + intake + GIS | `weather-api` extensions, adapters, GIS hooks |
| 6 | Realtime | `stream-processor`, Mongo, Socket.IO worker |
| 7 | UI | `AlertCard`, socket client |

### Environment variables

```env
MONGODB_URI=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
NASA_FIRMS_MAP_KEY=...
REDIS_URL=redis://127.0.0.1:6379
STREAM_PORT=3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
# Optional fusion:
# TOMORROW_IO_KEY=...
```

### One-line data flow

```
API → normalize (UnifiedEvent) → publish (Redis) → score → fuse context → OpenAIService → persist → Socket.IO → Dashboard
```

---

## Divergence summary (original v1.0 doc vs this plan)

| Original snippet | This repo plan |
|------------------|----------------|
| `src/lib`, camelCase `floodService` | `lib/`, kebab-case `flood-service` |
| `eventStore` only | Streaming bus + Mongo; optional dev `eventStore` |
| Batch polling narrative only | **Streaming ingestion** as architectural requirement |
| Phase 6 “Redis TTL store” only | Redis **Pub/Sub** + processor + **Mongo** + Socket.IO |
| `uuid` package | Prefer **`crypto.randomUUID()`** |
| DOMParser for RSS | **`fast-xml-parser`** |

---

*EarthquakeAlert | Ready2Go detailed architecture | earthquick repo | revised*
