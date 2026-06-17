# Threat Detection & Monitoring — Behavior, Field Logic & Fix Plan

**Surface:** `Threat Detection & Monitoring` card on `/super-admin-dashboard`
**Component:** [components/threat-monitoring.tsx](../components/threat-monitoring.tsx)
**Status:** The performance plan (cache + instant-then-refine) is **already implemented** on branch `feat/threat-fixes`. This document (a) explains the `ERR_CONNECTION_REFUSED` error in the console, (b) records an in-depth verification of the current behavior, (c) documents exactly how the four displayed fields are calculated, and (d) lists the remaining small changes for Claude Sonnet to implement.

---

## 1. Why the `net::ERR_CONNECTION_REFUSED` error occurs

The console shows **every** endpoint failing at the same instant, not just the risk endpoints:

```
GET /api/user/profile            net::ERR_CONNECTION_REFUSED   (user-store.tsx)
GET /api/alerts/community        net::ERR_CONNECTION_REFUSED   (alert-store.tsx)
GET /api/admin/situational-map   net::ERR_CONNECTION_REFUSED   (gis-map.tsx)
GET /api/risk-assessment/summary net::ERR_CONNECTION_REFUSED   (threat-monitoring.tsx:216)
```

`ERR_CONNECTION_REFUSED` means the browser could not open a TCP connection to `localhost:3000` **at all** — nothing answered the port. This is **not** an application/code bug:

- It is the signature of the **Next.js dev server being momentarily down or mid-restart** — typically right after saving a file (`next dev` recompiles and briefly drops the listener), a crash/OOM during compile, or the page being loaded before `next dev` finished booting.
- If a single API were broken, only that one route would fail (with a 4xx/5xx **response**), while `/api/user/profile` etc. kept working. Here *all unrelated routes* fail with no response — so the fault is the server process, not any handler.
- Confirmed live: `curl http://localhost:3000/api/health` now returns **404** (server reachable, just no such route), i.e. the server is back up and serving. The refused connections were transient.

**The card's "SERVICE TEMPORARILY UNAVAILABLE"** is simply its catch/timeout branch ([threat-monitoring.tsx:231-234](../components/threat-monitoring.tsx#L231-L234)) firing when the `/summary` fetch can't reach the server. It is correct behavior, but the UX can be softened (see §5, change #2): on a transient blip the card should auto-retry instead of waiting for the 90 s poll or a manual **Refresh**.

**Action for the user:** ensure `npm run dev` is running and has finished compiling before loading the dashboard; if it crashed, restart it. No code change is required to "fix" the connection-refused message itself — it is a dev-server lifecycle event.

---

## 2. Current architecture (verified)

The original bottleneck was that the card called the heavy `POST /api/risk-assessment/analyze` (8 live federal APIs + 2 OpenAI calls, no cache, ~24-30 s). That has been replaced. The card now does:

| Concern | Mechanism | File |
|---|---|---|
| **Instant first paint** | Restores the last row from `localStorage` before any fetch (no skeleton on repeat visits) | [lib/risk-assessment/client-report-cache.ts](../lib/risk-assessment/client-report-cache.ts), used at [threat-monitoring.tsx:51](../components/threat-monitoring.tsx#L51) |
| **KPI data** | Single fast `GET /api/risk-assessment/summary` (DB-backed, **no live APIs, no LLM**) | [app/api/risk-assessment/summary/route.ts](../app/api/risk-assessment/summary/route.ts) |
| **Live-Input checkmarks** | `GET /api/risk-assessment/source-health` — lightweight reachability probes per feed | [app/api/risk-assessment/source-health/route.ts](../app/api/risk-assessment/source-health/route.ts), [lib/services/risk-source-health.ts](../lib/services/risk-source-health.ts) |
| **Server cache** | Single-flight + stale-while-revalidate (90 s fresh / +600 s stale) | [lib/services/risk-report-cache.ts](../lib/services/risk-report-cache.ts) |
| **Manual refresh** | "Refresh" button → `/summary?refresh=1` → `getOrRevalidate(..., { force: true })` | [threat-monitoring.tsx:213](../components/threat-monitoring.tsx#L213), [risk-report-cache.ts:30,47,51](../lib/services/risk-report-cache.ts#L30) |
| **Background freshness** | Silent re-poll every 90 s; abort/timeout guard at 15 s | [threat-monitoring.tsx:255-258](../components/threat-monitoring.tsx#L255-L258) |
| **Progressive reveal** | The 4 metrics fade in one-by-one (120 ms apart) on first data | [threat-monitoring.tsx:174-189](../components/threat-monitoring.tsx#L174-L189) |

> Note: the card deliberately **no longer calls `/analyze`**. Its KPIs are aligned to `/summary`, so `/analyze` (the slow path) would add latency without changing what the card shows. `/analyze` is still used by the AI Risk Assessment page and is itself now cached + SWR via `getOrRevalidate` ([analyze/route.ts:87-95](../app/api/risk-assessment/analyze/route.ts#L87-L95)).

---

## 3. How the four displayed fields are calculated

All four values shown on the card derive from **`GET /api/risk-assessment/summary`**, which calls **`computeRiskSnapshot(events)`** ([lib/services/risk-current-snapshot.ts](../lib/services/risk-current-snapshot.ts)) over the user-/role-scoped live `UnifiedEvent` docs (the same feed as Alerts & Communication). The client maps the response in [threat-monitoring.tsx:220-225](../components/threat-monitoring.tsx#L220-L225).

### 3.1 Severity Level — e.g. `ELEVATED`

The **raw value** is `overall_risk_level`, derived from the **average severity score** of all active events.

1. Each event carries a `severity` ∈ {`Low`,`Moderate`,`High`,`Extreme`}, scored: `Low=1, Moderate=2, High=3, Extreme=4` ([risk-current-snapshot.ts:21-26](../lib/services/risk-current-snapshot.ts#L21-L26)). Events with an unknown severity default to **2**.
2. `avgScore = Σ(score) / event_count`.
3. Banded into the label ([risk-current-snapshot.ts:35-41](../lib/services/risk-current-snapshot.ts#L35-L41)):

| Average score | Severity Level |
|---|---|
| ≥ 3.5 | `SEVERE` |
| ≥ 2.75 | `HIGH` |
| ≥ 2.0 | `ELEVATED` |
| ≥ 1.5 | `MODERATE` |
| < 1.5 (or no events) | `LOW` |

> So `ELEVATED` means the nationwide active-event mix averages a score between **2.0 and 2.75** — i.e. predominantly Moderate events with a meaningful share of High/Extreme.

### 3.2 Geo-relevance — e.g. `Medium`

A **client-side re-bucketing** of `overall_risk_level` into a 3-level relevance, via `overallLevelToRelevance()` ([threat-monitoring.tsx:42-47](../components/threat-monitoring.tsx#L42-L47)):

| `overall_risk_level` | Geo-relevance | Color |
|---|---|---|
| `CRITICAL` / `SEVERE` / `HIGH` | **High** | rose |
| `ELEVATED` / `MODERATE` | **Medium** | amber |
| `LOW` / anything else | **Low** | emerald |

> `ELEVATED` → **Medium** (amber). It is a coarser presentation of the same severity signal — there is currently no separate geospatial computation behind "Geo-relevance"; it is a direct function of the overall level. (See §5, change #4 for an optional true geo-weighting.)

### 3.3 Affected Areas — e.g. `United States`

Resolved **entirely client-side** from the viewer's role/scope (not from event geometry), in `resolveAffectedArea()` ([threat-monitoring.tsx:80-132](../components/threat-monitoring.tsx#L80-L132)), in priority order:

1. If super-admin and a **specific sub-admin state** was passed as `locationName` (≠ `USA`/`Current Location`) → that state.
2. Else super-admin with `localStorage.userCountry` → that country.
3. Else sub-admin with `localStorage.userCity` → that city.
4. Else fall back to `GET /api/user/profile` (country for super-admin, city for sub-admin).
5. Final fallback → **`United States`** (this card only renders on the nationwide super-admin/admin dashboard, so the true scope is the whole country — never a vague "Regional scope").

> On the nationwide super-admin dashboard with no specific state selected, this resolves to **United States** by design.

### 3.4 Confidence Score — e.g. `87%`

`ai_confidence`, a transparent **multi-factor 0-100 score** from `computeAiConfidence()` ([lib/services/risk-ai-confidence.ts](../lib/services/risk-ai-confidence.ts)). Four earnable factors sum to 100 (each returns a `breakdown[]` with a human reason):

| # | Factor | Max | How it's earned |
|---|---|---|---|
| 1 | **Source Diversity** | 30 | Distinct feeds corroborating: 5+ → 30, 4 → 24, 3 → 18, 2 → 12, 1 → 4 ([:38-52](../lib/services/risk-ai-confidence.ts#L38-L52)) |
| 2 | **Data Freshness** | 30 | Median event age: <1 h → 30, <6 h → 24, <24 h → 16, <72 h → 8, else 2; no timestamps → 2 ([:54-79](../lib/services/risk-ai-confidence.ts#L54-L79)) |
| 3 | **Data Completeness** | 25 | Mean of (% events with `properties`) and (% events geolocated): ≥95% → 25, ≥85% → 20, ≥60% → 14, ≥30% → 8, else 2 ([:81-96](../lib/services/risk-ai-confidence.ts#L81-L96)) |
| 4 | **AI Service Availability** | 15 | OpenAI configured (`openaiService.isAvailable()`) → 15, else 0 ([:98-103](../lib/services/risk-ai-confidence.ts#L98-L103)) |

Final = `min(100, round(Σ))`. **Zero active events ⇒ score 0** with reason "No live data is available to assess" ([:22-34](../lib/services/risk-ai-confidence.ts#L22-L34)). The `aiAvailable` input is passed from the summary route via `openaiService.isAvailable()` ([summary/route.ts:67-68](../app/api/risk-assessment/summary/route.ts#L67-L68)).

> Example: 5 feeds (30) + median age <6 h (24) + ~90% complete (20) + OpenAI on (15) = **89%**.

### 3.5 Live Inputs checkmarks (not the AI Assessment block)

The five rows under **LIVE INPUTS** are **independent** of the four KPIs above. They reflect real reachability probes from `GET /api/risk-assessment/source-health` → `probeSourceHealth()` ([lib/services/risk-source-health.ts:101-109](../lib/services/risk-source-health.ts#L101-L109)), each a 6 s-timeout HEAD/GET to the upstream feed:

| Row key | Feed probed |
|---|---|
| `nws` | `api.weather.gov` root |
| `hydro` | NOAA NWPS gauge `SACC1` **AND** USGS IV `01646500` (both must respond) |
| `eq` | USGS `significant_day.geojson` |
| `firms` | NASA FIRMS `mapkey_status` (returns `false` if `NASA_FIRMS_MAP_KEY`/`NASA_FIRMS_API_KEY` unset) |
| `fema` | OpenFEMA `DisasterDeclarationsSummaries?$top=1` |

States: grey pulse = probing, emerald check = reachable, rose alert = down ([threat-monitoring.tsx:291-318](../components/threat-monitoring.tsx#L291-L318)). Cached server-side 60 s fresh / +120 s stale.

---

## 4. In-depth verification results

| Check | Result |
|---|---|
| All `risk-assessment` routes present | ✅ `analyze, historical, incident-details, population-at-risk, send-report, severity-summaries, source-health, strategic-plan, summary` |
| `source-health` route wired to `probeSourceHealth` + SWR cache | ✅ ([source-health/route.ts](../app/api/risk-assessment/source-health/route.ts)) |
| `summary` route uses `getOrRevalidate` + honors `?refresh=1` (`force`) | ✅ ([summary/route.ts:48,58,127](../app/api/risk-assessment/summary/route.ts#L48)) |
| `analyze` route cached + `skipHistorical` → skips 2nd LLM pass | ✅ ([analyze/route.ts:84-95](../app/api/risk-assessment/analyze/route.ts#L84-L95)) |
| `synthesizeDashboardRiskReport(bundle, { includeHistorical })` honored | ✅ ([openai-service.ts](../lib/services/openai-service.ts)) |
| Card: client cache, single fast fetch, 15 s timeout, 90 s poll, progressive reveal, abort guards | ✅ ([threat-monitoring.tsx](../components/threat-monitoring.tsx)) |
| TypeScript — threat-related files | ✅ clean **except one pre-existing nit** (see below) |
| TypeScript — whole project | ⚠️ 227 **pre-existing** errors (Mongoose `.lean()` typings, unrelated); build sets `typescript.ignoreBuildErrors: true`, so `next build` passes |

**Only threat-file type nit:** `app/api/risk-assessment/summary/route.ts:72` passes `recommendations: []` where `RiskReport.recommendations` is typed `string`. This **predates** the threat work (introduced in commit `de19942`) and is masked by `ignoreBuildErrors`. Harmless at runtime; cleanup listed below.

**Conclusion:** the Threat Detection & Monitoring functionality is implemented correctly and is healthy. The `ERR_CONNECTION_REFUSED` was a transient dev-server outage, not a defect.

---

## 5. Implementation plan — remaining changes for Claude Sonnet

These are small, optional polish items. None are required for correctness; #1 and #2 are recommended.

### Change #1 — Fix the pre-existing loose type in `summary` route (low effort, recommended)
**File:** [app/api/risk-assessment/summary/route.ts:69-76](../app/api/risk-assessment/summary/route.ts#L69-L76)
The object passed to `applyRiskReportToAlignedAlertFeed` sets `recommendations: []`, but `RiskReport.recommendations` is a `string`. Change to match the type:
```ts
const aligned = applyRiskReportToAlignedAlertFeed(
    {
        ...snapshot,
        recommendations: '',          // was [] — RiskReport.recommendations is a string
        recommendations_list: [],     // keep the array on its correct field
        historical_analysis: {},
    },
    alignedCards,
);
```
Verify `applyRiskReportToAlignedAlertFeed`'s input type and `RiskReport` in [lib/types/risk-assessment.ts](../lib/types/risk-assessment.ts) before finalizing field names. After: `npx tsc --noEmit 2>&1 | grep summary/route` should be empty.

### Change #2 — Auto-retry the card on transient network/server failure (low effort, recommended)
**File:** [components/threat-monitoring.tsx](../components/threat-monitoring.tsx) — `runAssessment` ([:196-247](../components/threat-monitoring.tsx#L196-L247))
Today a refused connection (dev server restart) surfaces "Service temporarily unavailable" until the 90 s poll or a manual Refresh. Add a short bounded backoff so a blip self-heals:
- On a failed/aborted fetch with **no cached row**, schedule up to ~3 retries at 2 s / 4 s / 8 s before showing the error.
- Use a `retryRef` counter; reset it on success. Respect the existing `mountedRef`/`busyRef`/`AbortController` guards and clear timers on unmount.
- Keep the existing error copy as the **final** state after retries are exhausted.

### Change #3 — Keep Live-Input keys and probes in sync (guard, very low effort)
**Files:** [lib/services/risk-source-health.ts](../lib/services/risk-source-health.ts), [components/threat-monitoring.tsx:274-280](../components/threat-monitoring.tsx#L274-L280), [source-health/route.ts](../app/api/risk-assessment/source-health/route.ts) (`ALL_KEYS`)
The row keys `['nws','hydro','eq','firms','fema']` are duplicated in three places. Export a single `LIVE_INPUT_KEYS` const from `risk-source-health.ts` and import it in the route and component so they can never drift.

### Change #4 — (Optional, larger) Make "Geo-relevance" a real geospatial signal
Currently Geo-relevance is a relabeling of `overall_risk_level`. If a distinct meaning is wanted (e.g. proximity/exposure to the viewer's jurisdiction), compute it from event geometry vs. the resolved scope (reuse `resolveSubAdminJurisdiction` / `coordinatesInJurisdiction` from [lib/sub-admin/jurisdiction.ts](../lib/sub-admin/jurisdiction.ts)) and return it from `/summary` as a new field, then read it in the card instead of `overallLevelToRelevance`. Only do this if product wants Geo-relevance to differ from severity.

### Verification for all changes
1. `npm run dev`; load `/super-admin-dashboard` as super-admin → card paints from cache instantly, KPIs fill from `/summary`, Live-Input checks reflect real feed reachability.
2. Stop `next dev` mid-session, reload → with #2, the card retries and recovers without manual Refresh once the server is back.
3. `npx tsc --noEmit 2>&1 | grep -E "summary/route|threat-monitoring|source-health"` → empty after #1/#3.
4. `npm run build` succeeds (tolerates the unrelated 227 pre-existing errors).
```
```
