# Threat Detection & Monitoring card — logic & data flow

Component: [`components/threat-monitoring.tsx`](../components/threat-monitoring.tsx)
Shown on the **Super Admin Dashboard**. It has two sections: **Live Inputs** (feed reachability) and **AI Assessment** (4 KPI fields).

The card was reworked to be **speed-first**: every field renders as fast as *its own* data source allows, and no field is held waiting on another. Nothing on this card calls OpenAI.

---

## 1. Live Inputs — real feed reachability

Each of the 5 rows shows a green check, a pulsing gray check, or a red alert icon based on whether that federal feed is **actually reachable right now**.

### Flow
```
ThreatMonitoring (mount)
  └─ GET /api/risk-assessment/source-health
       └─ getOrRevalidate('source-health:v1', probeSourceHealth, {ttl 60s, stale 120s})  ← SWR cache
            └─ probeSourceHealth()  → 5 probes in parallel (6s timeout each)
```

- Route: [`app/api/risk-assessment/source-health/route.ts`](../app/api/risk-assessment/source-health/route.ts)
- Service: [`lib/services/risk-source-health.ts`](../lib/services/risk-source-health.ts)
- Returns `{ sources: [{ key, ok }] }`. Each probe maps any failure/timeout to `ok: false`, so one slow feed never blocks the others.

### What each row probes (smallest viable request)

| Row (key) | Probe endpoint | Green when |
|-----------|----------------|------------|
| NWS flood & hydro alerts (`nws`) | `https://api.weather.gov/` (API root status) | `res.ok` |
| NOAA NWPS · USGS hydrology (`hydro`) | NWPS `…/nwps/v1/gauges/SACC1` **and** USGS `…/nwis/iv/?…sites=01646500…` | **both** `res.ok` |
| USGS earthquake feed (`eq`) | `…/feed/v1.0/summary/significant_day.geojson` | `res.ok` |
| NASA FIRMS thermal activity (`firms`) | `…/mapserver/mapkey_status/?MAP_KEY=…` | key present **and** `res.ok` |
| FEMA OpenFEMA declarations (`fema`) | `…/api/open/v2/DisasterDeclarationsSummaries?$top=1` | `res.ok` |

### Probe design notes (why these specific URLs)
- **NWS** uses the API *root* (`api.weather.gov/`), not the alerts feed — it returns a tiny JSON discovery doc in ~300ms instead of the slow, large `/alerts/active` payload.
- **FIRMS** uses the `mapkey_status` endpoint (98 bytes, ~1s). The FIRMS *Area* API only serves **CSV** — requesting `json` returns a 400 HTML help page, which is why a naive json probe shows red even when the feed is healthy. `mapkey_status` confirms both that the service is up *and* that our API key is valid/within quota — exactly the "is data available from this feed" signal we want.
- **Hydro** is a combined row, so it requires *both* NWPS and USGS to respond.
- **FIRMS** returns `ok:false` with **no network call** when `NASA_FIRMS_MAP_KEY` / `NASA_FIRMS_API_KEY` is unset.

### Render states ([`threat-monitoring.tsx`](../components/threat-monitoring.tsx) Live Inputs map)
- `ok === true` → green `CheckCircle2`
- `ok === undefined` (still probing) → pulsing gray `CheckCircle2`
- `ok === false` → red `AlertCircle` + red label

### Cost / speed
First caller after a cold cache pays ~6s worst case (slowest probe). For the next 60s every caller gets the cached result instantly; between 60–180s the stale result is served instantly while a background refresh runs. The probes were timer-faked before this rework (they always lit green on a 100ms stagger regardless of reality).

---

## 2. AI Assessment — 4 KPI fields

| Field | Source value | Derivation | Renders when |
|-------|--------------|------------|--------------|
| **Geo-Relevance** | `overall_risk_level` | `overallLevelToRelevance()` → High / Medium / Low | Stage 1 |
| **Severity Level** | `overall_risk_level` | uppercased as-is (e.g. CRITICAL) | Stage 1 |
| **Affected Areas** | user role + location | resolved from `localStorage` (`userRole`/`userCity`/`userCountry`), `/api/user/profile` fallback | instant on mount |
| **Confidence Score** | `ai_confidence` | deterministic number 0–100 | Stage 1 |

**None of these is AI-generated.** `overall_risk_level` and `ai_confidence` are pure deterministic math. "AI Assessment" is just the section label.

### Two-stage load (per field, never blocking)
```
Stage 1  GET /api/risk-assessment/summary    ← FAST, primary, paints all 3 KPIs, clears spinner
Stage 2  POST /api/risk-assessment/analyze   ← SLOW, silent background refine, updates only changed values
```

- **Stage 1 (`/summary`)** — fast: reads pre-synced events from MongoDB and runs `computeRiskSnapshot()`. **No external fetches, no OpenAI.** This is the primary source and the only step that drives the loading spinner.
- **Stage 2 (`/analyze`)** — slow (20–40s): runs `runDashboardIngest()` (8 live federal fetches) + an OpenAI synthesis used by the *full* AI Risk Assessment page. On this card it runs **silently in the background** — no spinner, never errors the card — and only nudges a KPI value if it actually changed (diffed in the `setRow` updater).
- **Affected Areas** resolves on its own from `localStorage` and never waits on either fetch.

> **KPI consistency (important):** `/analyze` no longer derives the two headline KPIs (`overall_risk_level`, `ai_confidence`) from its live-feed bundle. It now recomputes them from the **same aligned `UnifiedEvent` docs** using the **same `computeRiskSnapshot()`** as `/summary` (see [`analyze/route.ts`](../app/api/risk-assessment/analyze/route.ts), the override right after `let report = baseReport`). Same data + same function ⇒ Stage 1 and Stage 2 produce **identical** Geo-Relevance / Severity / Confidence, so the silent refine causes no visible jump, and the dashboard card matches the AI Risk Assessment page. `/analyze`'s live-feed/AI fields (findings, recommendations, narrative, domain severities) are untouched.

A `sessionStorage` row cache ([`lib/risk-assessment/client-report-cache.ts`](../lib/risk-assessment/client-report-cache.ts)) gives a skeleton-free first paint on repeat loads; Stage 1 then overwrites it.

---

## 3. Where the "stored DB" data comes from

Stage 1 (`/summary`) reads the **`UnifiedEvent` MongoDB collection** ([`models/UnifiedEvent.ts`](../models/UnifiedEvent.ts)) via `fetchAlignedUnifiedEventDocsForSession()`. That collection is **not hand-entered** — it is a continuously-refreshed mirror of the same live feeds the Live Inputs section probes:

```
External feeds ──(sync jobs)──▶ UnifiedEvent (MongoDB) ──▶ /api/risk-assessment/summary ──▶ KPI fields
   NWS, USGS, NWPS,                                              (fast, deterministic,
   NASA FIRMS, InciWeb, FEMA                                      no external calls, no AI)
```

Writers that populate `UnifiedEvent`:
- [`lib/services/alert-communication-nws-sync.ts`](../lib/services/alert-communication-nws-sync.ts) — NWS alerts → UnifiedEvent
- [`lib/services/alert-communication-multi-sync.ts`](../lib/services/alert-communication-multi-sync.ts) — USGS, NWPS, NASA FIRMS, InciWeb, FEMA → UnifiedEvent
- [`lib/services/unified-event-historical-ingest.ts`](../lib/services/unified-event-historical-ingest.ts) — historical events (e.g. USGS earthquakes)

These syncs are triggered by [`alert-communication-feed-sync-gate.ts`](../lib/services/alert-communication-feed-sync-gate.ts) (`syncAlertCommunicationFeedsGate`), which runs on the Alerts & Communication flow: empty DB → full pull, otherwise a throttled stale refresh. So the DB stays close to live, and the summary endpoint reads it without paying the per-request federal-fetch latency.

**Difference between the two endpoints:**
- `/summary` → reads the DB mirror → fast, deterministic, what the card shows first.
- `/analyze` → hits all 8 federal APIs live + OpenAI → slow, freshest external snapshot, used by the full AI Risk Assessment page and as this card's silent refine.
- **The two headline KPIs are aligned:** both endpoints compute `overall_risk_level` and `ai_confidence` via `computeRiskSnapshot()` over the same aligned `UnifiedEvent` docs, so they always match. `/analyze` adds the richer live-feed/AI layers on top.

---

## 4. Files

| File | Role |
|------|------|
| [`components/threat-monitoring.tsx`](../components/threat-monitoring.tsx) | Card UI; health fetch, per-field state, silent refine |
| [`lib/services/risk-source-health.ts`](../lib/services/risk-source-health.ts) | 5 parallel reachability probes |
| [`app/api/risk-assessment/source-health/route.ts`](../app/api/risk-assessment/source-health/route.ts) | SWR-cached health endpoint |
| [`app/api/risk-assessment/summary/route.ts`](../app/api/risk-assessment/summary/route.ts) | Stage 1 KPIs from DB mirror |
| [`app/api/risk-assessment/analyze/route.ts`](../app/api/risk-assessment/analyze/route.ts) | Stage 2 live ingest + AI (silent refine) |
| [`lib/services/risk-report-cache.ts`](../lib/services/risk-report-cache.ts) | Shared stale-while-revalidate cache |
