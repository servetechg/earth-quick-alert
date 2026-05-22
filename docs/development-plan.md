# AI Risk Assessment — Development Plan & Roadmap

This document is the authoritative implementation roadmap for refactoring the AI Risk Assessment feature so that **all data is sourced from the `UnifiedEvent` MongoDB model** and is **fully dynamic** based on currently active events. It supersedes prior ingest-based (USGS/NWPS/FIRMS/etc.) logic for this page.

Source-of-truth documents:
- `docs/readme.md` — requirements
- `docs/explainatio.md` — requirement specification
- `models/UnifiedEvent.ts` — schema
- `lib/services/openai-service.ts` — current AI service (to be partially refactored)
- `app/(admin)/ai-risk-assessment/page.tsx` — current UI (to be partially refactored)

---

## 1. Core Principles

1. **Single source of truth = `UnifiedEvent`**. Do not call USGS/NOAA/NWPS/FIRMS/InciWeb directly from this page. The DB already aggregates them via existing ingest pipelines.
2. **`dataStatus` field is the live/past switch**:
   - `dataStatus: 'current'` → active incidents → drive all "current" UI.
   - `dataStatus: 'past'` → historical pool → drive "Past Damages" and "Past Procedures".
3. **Category-driven dynamism**. If no `current` events exist for a category, that category:
   - is excluded from the bar chart,
   - has no Historical Context tab,
   - is not counted in any KPI.
4. **Progressive rendering**. Render deterministic numbers (KPIs, bar chart, severity buckets) immediately. AI-generated prose streams in after.
5. **AI isolation per category**. Each Historical Context tab calls OpenAI **independently** (in parallel) so categories never bleed into one another.
6. **Plain-English voice**. Continue to apply the existing `PLAIN_ENGLISH_STYLE_RULES` from `openai-service.ts` for every AI prompt.

---

## 2. Data Model Reference

`UnifiedEvent` (see [models/UnifiedEvent.ts](../models/UnifiedEvent.ts)) — key fields used:

| Field | Use |
|---|---|
| `category` | Hazard family. Drives all grouping. Enum: `flood`, `earthquake`, `wildfire`, `storm`, `marine`, `coastal_surf`, `hazardous`, `hurricane_typhoon`, `tsunami`, `volcanic`, `landslide`, `winter_weather`, `air_quality`, `extreme_heat`, `fema_declaration`. |
| `severity` | `Low` \| `Moderate` \| `High` \| `Extreme`. Drives Overall Threat Level, Major/Minor split, and Severity Level grouping. |
| `dataStatus` | `current` vs `past`. Primary partition. |
| `properties` | Category-specific measurements (e.g. earthquake `magnitude`, flood gauge `stage`/`cfs`, wildfire `acres`/`containment`, storm wind/precip). Used to find similar past events and to feed AI summaries. |
| `name`, `description`, `location`, `lat`, `lng`, `issuedAt`, `expiresAt`, `instructions` | Pass-through context for AI. |
| `source`, `type`, `status` | Secondary context for the AI prompt. |

### 2.1 Property Field Discovery (IMPORTANT)

The per-category property map in §6.1 lists **plausible** field names (`magnitude`, `acres`, `stage`, etc.) but **the actual keys inside `properties` are set by upstream ingest jobs and have not been hand-verified here**. Before wiring §6.1 into a Mongo query, Sonnet MUST:

1. Inspect the ingest code that writes `UnifiedEvent.properties` for each `source` (grep for `properties:` assignments in `lib/services/ingest/**` or wherever the ingest pipelines live).
2. Spot-check 5–10 sample docs per category in the running DB to confirm the actual nested keys.
3. Update the property map in `risk-similar-events.ts` (and §6.1 of this doc) with the verified keys.
4. If a category has no usable numeric matching key, document that and use the category-only fallback (§6.2 step 5).

Treat §6.1 as a **starting hypothesis**, not ground truth.

---

## 3. High-Level Architecture

```
┌──────────────────────────── Client (page.tsx) ────────────────────────────┐
│  Stage 1  Skeleton + deterministic KPIs (parallel fetch /summary)         │
│  Stage 2  Severity Level cards (parallel fetch /severity-summaries)       │
│  Stage 3  Historical tabs (lazy per-tab fetch /historical/:category)      │
│  Stage 4  Strategic Recommendations (derived from future measures)        │
└───────────────────────────────────────────────────────────────────────────┘
                       │           │             │
                       ▼           ▼             ▼
┌────────────── New API routes (app/api/risk-assessment/…) ─────────────────┐
│  GET /summary                  → deterministic KPIs + distribution        │
│  POST /severity-summaries      → AI summary per (severity, category)      │
│  POST /historical/:category    → AI for one Historical tab                │
│  POST /strategic-plan          → AI action plan from future_measures      │
└───────────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────── Server services (lib/services/) ──────────────────────┐
│  unified-event-repo.ts     ← read helpers over UnifiedEvent               │
│  risk-current-snapshot.ts  ← computes KPIs / distribution / severity map  │
│  risk-similar-events.ts    ← per-category "similar past events" lookups   │
│  openai-service.ts (ext.)  ← new methods (see §7)                         │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Deterministic Computations (no AI, must be instant)

Implement in `lib/services/risk-current-snapshot.ts`. Pure functions over an in-memory list of current `UnifiedEvent` docs.

### 4.1 Active Incidents
- `alerts_count = currentEvents.length`
- **Major / Minor split** by `severity`:
  - **Major** = `severity ∈ { 'High', 'Extreme' }`
  - **Minor** = `severity ∈ { 'Low', 'Moderate' }`

### 4.2 Overall Threat Level
Average severity numerically, then map back to a label.
```
severityScore: Low=1, Moderate=2, High=3, Extreme=4
avg = mean(severityScore(e) for e in currentEvents)
label =
  avg >= 3.5 → 'SEVERE'
  avg >= 2.75 → 'HIGH'
  avg >= 2.0  → 'ELEVATED'
  avg >= 1.5  → 'MODERATE'
  else        → 'LOW'
```
If `currentEvents.length === 0` → `'LOW'` and the page goes into the empty state.

### 4.3 Incident Distribution (bar chart)
- Group `currentEvents` by `category`.
- Emit only categories whose count > 0.
- Row: `{ category, count }`.
- This list also defines the **active hazard set** used by every other section.

### 4.4 Severity Buckets (drives §5)
- Group `currentEvents` by `severity` (only buckets that have ≥1 event are emitted).
- Inside each bucket, sub-group by `category`.

### 4.5 AI Confidence & Population at Risk
Requirements say "leave as is". The old values came from `synthesizeDashboardRiskReport` + ACS county roll-ups in the dashboard-ingest path, which the new page no longer calls. To preserve the UI without reviving the old pipeline:

- **`ai_confidence`** — deterministic heuristic in `risk-current-snapshot.ts`:
  ```
  base 60
  + 15 if currentEvents.length >= 5
  + 10 if distinct categories >= 3
  + 10 if at least one event has populated `properties` (non-empty object)
  +  5 if `sources_count >= 3` (distinct `source` values among current events)
  clamp 0..100
  ```
- **`populations_at_risk`** — until ACS data is rewired:
  - If the existing dashboard-ingest endpoint is still available server-side, call it lazily and cache the value for 10 minutes.
  - Otherwise return `0` and have the UI render an em-dash (`—`) instead of "0" when the value is `0`, so it doesn't read as "zero people affected".

These are explicitly **out of scope to perfect**. Just don't break the UI.

---

## 5. Severity Levels Section (NEW)

Replaces the existing `meteorological / hydrological / fire` three-card layout described in the current page. Up to 4 cards — one per severity present in current data.

### 5.1 Layout
- One card per active severity (`Low`, `Moderate`, `High`, `Extreme` — only the present ones).
- Inside each card, one sub-block per category that has events at that severity.
- Each sub-block shows the AI summary for that `(severity, category)` pair.

### 5.2 API: `POST /api/risk-assessment/severity-summaries`
Request body: nothing (server reads current events from DB).
Response:
```ts
{
  buckets: Array<{
    severity: 'Low' | 'Moderate' | 'High' | 'Extreme',
    categories: Array<{
      category: string,
      eventCount: number,
      summary: string,   // AI-generated, plain English
    }>
  }>
}
```

### 5.3 AI Prompt (per `(severity, category)`)
- System: existing `PLAIN_ENGLISH_STYLE_RULES` + "You are summarizing all active <category> events at <severity> severity for an executive briefing."
- User: serialized list of events at that (severity, category) — include `name`, `location`, `issuedAt`, `expiresAt`, `description`, **and the relevant `properties` fields** (see §6.1 for the per-category field map).
- Rules: Must include **every key statistic, magnitude, location, count**. No fabrication.

### 5.4 Parallelization
Fire one OpenAI call per `(severity, category)` pair, in parallel (`Promise.all`). Cap concurrency at 6 to avoid rate limits — implement via a small semaphore (or `p-limit`).

---

## 6. Historical Context & Mitigation Strategy

One tab per active category. The component already exists in [page.tsx:484](../app/(admin)/ai-risk-assessment/page.tsx#L484) (`HistoricalAnalysisSection`) — keep the shell, swap the data source.

### 6.1 Per-Category Property Map (the "matching key")

This map drives both **similar past event lookup** and **AI prompt enrichment**. Implement as a constant in `lib/services/risk-similar-events.ts`.

| Category | Primary matching field(s) in `properties` | Match tolerance |
|---|---|---|
| `earthquake` | `magnitude` | ±0.5 magnitude |
| `flood` | `stage` or `flowCfs` (whichever present) | ±25% |
| `wildfire` | `acres` (size band) | within same band: <100, 100–1k, 1k–10k, 10k–100k, >100k |
| `hurricane_typhoon` | `category` (Saffir-Simpson) or `windMph` | ±1 category or ±15 mph |
| `storm` | `windMph` or `hailIn` or `precipIn` | ±20% on whichever primary |
| `tsunami` | `waveHeightM` | ±30% |
| `volcanic` | `vei` or `ashHeightKm` | ±1 VEI |
| `landslide` | `volumeM3` or `slopeAngleDeg` | within same magnitude band |
| `winter_weather` | `snowfallIn` or `tempF` | ±25% |
| `extreme_heat` | `heatIndexF` or `tempF` | ±10°F |
| `air_quality` | `aqi` | ±50 AQI |
| `marine` / `coastal_surf` | `waveHeightFt` or `windKt` | ±25% |
| `hazardous` | `materialClass` (exact match if present) | exact |
| `fema_declaration` | `disasterType` (exact) | exact |

If a property is missing or sparse, fall back to **same-category, same-state (`location` substring), ordered by `updatedAt` desc**, take top 3.

### 6.2 Similar Past Event Lookup

In `lib/services/risk-similar-events.ts`:

```ts
async function findSimilarPastEvents(
  currentEvent: UnifiedEventDoc,
  limit = 3
): Promise<UnifiedEventDoc[]>
```

Algorithm (the spec mandates **at least 3** similar events when any are available):
1. Read the property map entry for `currentEvent.category`.
2. **If the primary property is missing on the current event** (e.g. earthquake doc has no `magnitude` field): skip steps 3–4 and go straight to the category fallback in step 5.
3. Build a Mongo query: `{ category, dataStatus: 'past', <propertyKey>: { $gte: lo, $lte: hi } }`.
4. Sort by closeness to the current value (`$abs` diff), then by `issuedAt` desc. Limit to `limit`.
5. If fewer than `limit` results, relax tolerance up to **two** times (×2, then ×4) and re-query each time.
6. If still fewer than `limit`, top up with category-only matches scoped to the same state (`location` substring), ordered by `updatedAt` desc, until `limit` is reached or the pool is exhausted.
7. If the final result is **empty** → return `[]`. The caller MUST handle this gracefully (see §6.5).
8. If non-empty but fewer than 3 → still return what we have; UI labels them as "partial match" via the §6.4 confidence score.

For the tab as a whole (multiple current events of the same category), pick the **most severe current event** as the seed, OR aggregate similar-past results across all current seeds and de-dup by `externalId`.

### 6.3 API: `POST /api/risk-assessment/historical/:category`
Per-tab, called lazily on tab activation (or eagerly in parallel after Stage 1 — pick eager parallel for snappier UX; cap at 6 in flight).

Request body: `{ category: string }` (also in URL).
Server steps:
1. Load current events of this category from DB.
2. Find similar past events (§6.2).
3. Fire **four** OpenAI calls **in parallel** for this single category (Matched Event + Past Damages + Past Procedures live within one prompt — keep them in ONE call to halve cost; Current Procedures = one call; Future Measures = one call that depends on the outputs of the first two).

Actually consolidate: **2 OpenAI calls per tab**, sequenced:
- Call A (parallel with B): `pastSummary` → returns `{ matched_event, similarity_summary, past_damages[], past_procedures[] }`. Input: similar past events.
- Call B (parallel with A): `currentSummary` → returns `{ current_procedures[] }`. Input: current events of this category.
- Call C (after A+B): `futureSummary` → returns `{ future_measures[] }`. Input: A and B outputs.

Across all active categories (say N=5), this is roughly `N * 3` OpenAI calls, all parallelizable except the C-after-AB dependency per category. Use a semaphore (limit 6) across the whole batch.

Response:
```ts
{
  category: string,
  historical_analysis: {
    matched_event?: string,
    similarity_summary?: string,
    past_damages?: string[],
    past_procedures?: string[],
    current_procedures?: string[],
    future_measures?: string[],
    match_confidence: number,   // computed: see §6.4
  },
  hasSimilarPast: boolean,       // false → UI shows graceful empty msg
}
```

### 6.4 Match Confidence (deterministic, not AI)
```
confidence =
  base 40
  + 20 if similarPastCount >= 3
  + 15 if primary property exists on current AND past
  + 10 if same state as current
  + 15 if avg severity match (Δ ≤ 1 severity step)
  clamp 0..100
```

### 6.5 Empty-State Handling

- `hasSimilarPast === false` → tab still renders, but:
  - `Past Damages & Losses` box shows: *"No comparable past events found in our records for this hazard profile. Past damage estimates are not available."*
  - `Past Procedures` box shows: *"No prior response procedures on file for events matching this signature."*
  - `Current Procedures` and `Future Preventative Measures` still render normally (they don't depend on past data).
- `currentEvents.length === 0` for a category → no tab at all (filtered out at §4.3).

### 6.6 Prompt Skeletons

**A — `generateHistoricalPastSummary` (per category)**
- System: plain-English rules + "You are summarizing 3 past <category> events similar to today's active situation. Cite event names, dates (friendly format), locations, casualties, property damage, and federal aid where present. Wrap key facts in `**bold**`."
- User: JSON list of similar past events including `name`, `issuedAt`, `location`, `description`, `properties` (full), `instructions`.
- Response schema: `{ matched_event, similarity_summary, past_damages: string[], past_procedures: string[] }`.

**B — `generateHistoricalCurrentSummary` (per category)**
- System: plain-English rules + "Rewrite the live <category> events into plain sentences for the public — what is happening, where, who is affected, when. Wrap key facts in **bold**."
- User: JSON list of current events with same fields.
- Response: `{ current_procedures: string[] }`.

**C — `generateHistoricalFutureMeasures` (per category)**
- System: plain-English rules + "Given what happened before and what is happening now, propose realistic, expert-grade long-term mitigation strategies for senior emergency managers. Be specific — name infrastructure, policy, training, and budget items. Never generic platitudes."
- User: outputs of A + B (just the prose).
- Response: `{ future_measures: string[] }`.

---

## 7. Strategic Recommendations

A single AI call **after** all per-category `future_measures` have arrived. Aggregates across categories into one prioritized action plan.

### 7.1 API: `POST /api/risk-assessment/strategic-plan`
Request: `{ futureMeasuresByCategory: Record<string, string[]> }`.
Response:
```ts
{
  recommendations_list: Array<{
    priority: 'IMMEDIATE' | 'URGENT' | 'STANDARD',
    action: string,
    step: number,
    deployable: boolean,
  }>
}
```

### 7.2 Prompt
- System: "You are an emergency operations chief. Translate the proposed future measures into a numbered, sequenced action plan. Each item must be a concrete deployable step (own it, schedule it, fund it, train it). Assign IMMEDIATE / URGENT / STANDARD priority. Bold the verb at the start of each action."
- User: serialized `futureMeasuresByCategory`.

---

## 8. OpenAI Service Extensions

Add to `lib/services/openai-service.ts`. Keep existing methods used elsewhere; mark the dashboard-ingest path (`synthesizeDashboardRiskReport`, `generateHistoricalContext`) as **legacy** — do not remove yet, but the new page will not call them.

New methods (signatures):
```ts
class OpenAIService {
  // §5
  generateSeverityCategorySummary(input: {
    severity: 'Low'|'Moderate'|'High'|'Extreme',
    category: string,
    events: UnifiedEventDoc[],
  }): Promise<string>;

  // §6.6 A
  generateHistoricalPastSummary(input: {
    category: string,
    similarPastEvents: UnifiedEventDoc[],
    currentSeed: UnifiedEventDoc,
  }): Promise<{
    matched_event?: string;
    similarity_summary?: string;
    past_damages?: string[];
    past_procedures?: string[];
  }>;

  // §6.6 B
  generateHistoricalCurrentSummary(input: {
    category: string,
    currentEvents: UnifiedEventDoc[],
  }): Promise<{ current_procedures?: string[] }>;

  // §6.6 C
  generateHistoricalFutureMeasures(input: {
    category: string,
    pastSummary: { past_damages?: string[]; past_procedures?: string[] },
    currentSummary: { current_procedures?: string[] },
  }): Promise<{ future_measures?: string[] }>;

  // §7
  generateStrategicPlan(input: {
    futureMeasuresByCategory: Record<string, string[]>,
  }): Promise<RecommendationItem[]>;
}
```
All four reuse the existing `callOpenAI<T>` helper and `PLAIN_ENGLISH_STYLE_RULES`. All return JSON. All have deterministic fallbacks.

---

## 9. Repository Layer

`lib/services/unified-event-repo.ts` — thin Mongo wrappers:

```ts
getCurrentEvents(opts?: { stateCd?: string }): Promise<UnifiedEventDoc[]>;
getPastEventsByCategory(category: string, opts?: {...}): Promise<UnifiedEventDoc[]>;
findSimilarPastEvents(seed: UnifiedEventDoc, limit?: number): Promise<UnifiedEventDoc[]>;
```

- All queries scoped by jurisdiction when `me.role !== 'super-admin'` and `me.state` is set. Mirrors the existing `riskAnalyzeContext` plumbing already on the page.
- Use indexes already declared: `{ source: 1, dataStatus: 1, updatedAt: -1 }`. Add a new compound index suggestion: `{ category: 1, dataStatus: 1, updatedAt: -1 }` — emit a migration note, do not auto-create.

---

## 10. API Routes — File Plan

Create under `app/api/risk-assessment/`:

1. `summary/route.ts` — `GET`. Returns deterministic KPIs, distribution, severity-bucket structure (without AI summaries). Fast. <200ms target.
2. `severity-summaries/route.ts` — `POST`. Returns the per-(severity,category) AI summaries.
3. `historical/[category]/route.ts` — `POST`. Returns one tab's data.
4. `strategic-plan/route.ts` — `POST`. Returns final recommendations.

The legacy `analyze/route.ts` may be kept for back-compat but the new page must not depend on it.

### 10.1 Auth & Jurisdiction Scoping
- Every new route must reuse the existing auth pattern from `analyze/route.ts` (read session, derive `me`, reject if unauthorized).
- All Mongo queries must apply jurisdiction scoping in the repo layer: `super-admin` → unscoped; otherwise scope by `me.state` (match against `location` and/or the existing state field used elsewhere — check `analyze/route.ts` for the canonical filter).
- The client sends the same `riskAnalyzeContext` body as today (see [client-analyze-context.ts](../lib/risk-assessment/client-analyze-context.ts)) so server-side scope derivation is consistent.

### 10.2 Caching & Idempotency
- Add a lightweight in-memory cache (Node `Map` keyed by `userId + jurisdiction`) with a **60-second TTL** for `/summary`, `/severity-summaries`, and each `/historical/:category` response.
- Rationale: a user mashing "Generate" twice should not re-spend OpenAI tokens. Cache invalidates after 60s so they can still pull a fresh snapshot.
- No persistent cache (Redis etc.) — keep it process-local.

---

## 11. UI Refactor — `app/(admin)/ai-risk-assessment/page.tsx`

### 11.1 Stages
1. **On mount** → call `/summary`. Render KPIs, bar chart, severity card shells (with spinners inside).
2. **In parallel with (1)** → call `/severity-summaries`. As responses arrive (the route returns one combined payload, but render progressively if you stream — otherwise render once on complete).
3. **In parallel with (1)** → for every active category, call `/historical/:category`. As each resolves, populate its tab. Tabs without data show a small spinner.
4. **After all historicals resolve** → call `/strategic-plan`. Render the recommendations card.

### 11.2 Component Changes
- **Keep**: `KpiCard`, `CircularConfidence`, `HistoricalAnalysisSection`, `HistoricalAnalysisBody`, `HistoricalQuadrant`, `HistoryBulletList`, `renderFindingEmphasis`, PDF export.
- **Replace**: the 3-card findings grid (`Meteorological / Hydrological / Fire`) with a new `SeverityLevelGrid` component that maps over `{1..4}` active severity buckets and renders one card per bucket with N sub-blocks (categories). Use the existing `FindingsCard` styling vocabulary.
- **Adjust**: `HistoricalAnalysisSection` already supports per-category tabs (`tabOrder` from `incidentCategoriesWithPositiveChartCount`). The only change is that `historical_analysis_by_incident` is now populated **incrementally** by separate per-category fetches. Add a per-tab loading state.
- **Remove from `RiskReport` consumption**: nothing breaks if we keep the type, but ensure the page derives `incident_distribution`, `alerts_count`, `major_incidents`, `minor_incidents` from the new `/summary` payload, not from the AI.

### 11.3 PDF Export
- Continue using the existing `downloadPdf` flow as a skeleton, but **rewrite its content sections** to match the new page:
  - **Remove** the `Meteorological Findings` / `Hydrological Risk` / `Active Fire Threats` blocks (those fields no longer exist).
  - **Add** a "Severity Levels" section that iterates each active severity bucket and prints each `(severity → category → summary)` sub-block.
  - **Keep** the Historical Context per-incident loop (it already iterates `historical_analysis_by_incident`).
  - **Keep** Strategic Recommendations.
- Only enable the button once **all four stages** have completed (`canDownload = summaryReady && severityReady && historicalReady && planReady`).
- Continue stripping `**` markdown markers before passing to `jsPDF.text` (jsPDF can't render inline bold runs).

---

## 12. Type Additions

Add to `lib/types/risk-assessment.ts`:

```ts
export interface SeverityBucket {
  severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
  categories: Array<{
    category: string;
    eventCount: number;
    summary: string;
  }>;
}

export interface RiskSummaryPayload {
  generated_at: string;
  overall_risk_level: 'LOW'|'MODERATE'|'ELEVATED'|'HIGH'|'SEVERE';
  alerts_count: number;
  major_incidents: number;
  minor_incidents: number;
  incident_distribution: Array<{ category: string; count: number }>;
  active_categories: string[];
  active_severities: Array<'Low'|'Moderate'|'High'|'Extreme'>;
  ai_confidence: number;          // keep current logic
  populations_at_risk: number;    // keep current logic
  sources_count: number;
}

export interface HistoricalTabPayload {
  category: string;
  historical_analysis: HistoricalAnalysis;
  hasSimilarPast: boolean;
}
```

---

## 13. Latency Budget

| Stage | Target | Notes |
|---|---|---|
| `/summary` | <300ms | DB aggregation + math only. |
| `/severity-summaries` | 2–5s | Up to 16 parallel OpenAI calls (4 severities × 4 categories worst case), capped at 6 concurrent. |
| `/historical/:category` (each) | 3–6s | 3 OpenAI calls/tab; C waits on A+B. |
| `/strategic-plan` | 2–4s | 1 OpenAI call. |
| **Total wall clock** | **<8s** for first AI content visible, **<12s** for everything. |

Use `gpt-4o-mini` everywhere (matches current `this.model` default). Cap `max_tokens` per call between 400–900 depending on section.

---

## 14. Error & Resilience Rules

1. Every OpenAI call has a deterministic fallback (mirror existing pattern in `callOpenAI<T>`).
2. If `OPENAI_API_KEY` is missing: render deterministic data + show a static "AI summaries unavailable — set OPENAI_API_KEY" banner in each AI section. Page still works.
3. If a single per-category historical fetch throws, that tab shows an inline retry button; the rest of the page is unaffected.
4. If a Mongo query fails: surface `toast.error` and abort the whole generate (we have no fallback for missing data).

---

## 15. Implementation Order (suggested PR sequence)

1. **PR 1 — Repo + summary route**
   - `unified-event-repo.ts`, `risk-current-snapshot.ts`, `GET /summary`.
   - Wire the page to call `/summary` for KPIs + bar chart (still showing legacy findings).
   - No AI changes yet.
2. **PR 2 — Severity Levels**
   - `generateSeverityCategorySummary`, `POST /severity-summaries`, new `SeverityLevelGrid` component.
   - Remove the 3-card findings grid from the page.
3. **PR 3 — Historical per-category**
   - `risk-similar-events.ts` + property map.
   - `generateHistoricalPastSummary` / `…CurrentSummary` / `…FutureMeasures`.
   - `POST /historical/[category]`.
   - Wire `HistoricalAnalysisSection` to incremental fetches.
4. **PR 4 — Strategic plan**
   - `generateStrategicPlan`, `POST /strategic-plan`, swap recommendation source.
5. **PR 5 — Cleanup + PDF gating**
   - Mark legacy dashboard-ingest path as deprecated.
   - Gate PDF on full readiness.
   - Add `{ category: 1, dataStatus: 1, updatedAt: -1 }` index migration note.

---

## 16. Acceptance Checklist

- [ ] No active events → page shows empty state, no AI calls fire.
- [ ] Categories with 0 current events are absent from bar chart, severity cards, and historical tabs.
- [ ] Bar chart counts sum to `alerts_count`.
- [ ] `major + minor === alerts_count`; major = High+Extreme.
- [ ] Overall Threat Level matches the §4.2 formula on a hand-traced sample.
- [ ] Each active severity renders exactly one card; each category within it renders exactly one sub-block.
- [ ] Each Historical tab corresponds to a category present in the bar chart.
- [ ] When no similar past events exist, Past Damages / Past Procedures display the friendly empty message; Current Procedures and Future Measures still render.
- [ ] Per-category Historical fetches run in parallel (verify via DevTools waterfall).
- [ ] No OpenAI call mixes events from two different categories.
- [ ] Page becomes interactive within ~1s; first AI content appears within ~5s; full plan within ~12s.
- [ ] PDF export contains all rendered sections and no literal `**` markers.
- [ ] `OPENAI_API_KEY` unset → deterministic UI still renders without errors.
- [ ] Property keys in §6.1 verified against real DB documents before queries are built.
- [ ] Each Historical tab targets **at least 3** similar past events (or surfaces the friendly empty-state copy if none exist).
- [ ] Jurisdiction scoping enforced on every new route (non-`super-admin` users only see their state).
- [ ] PDF export no longer references `meteorological_findings` / `hydrological_findings` / `fire_findings`.
- [ ] Two rapid "Generate" clicks within 60s do not double-charge OpenAI (cache hit).

---

## 17. Cross-Cutting Concerns

### 17.1 "Current Procedures" semantics
The spec says Current Procedures comes from "live ingest for this category". In the new architecture **live ingest = `UnifiedEvent` docs with `dataStatus: 'current'` for that category**. There is no separate live API call from this page — the DB is the live source.

### 17.2 Multiple current events of the same category
A category tab may correspond to many current events (e.g. 7 active wildfires). For each AI call:
- Pass **all** current events in that category (not just the seed) to `generateHistoricalCurrentSummary` — the spec requires every event's details to appear.
- For `generateHistoricalPastSummary`, use the **most severe / largest magnitude** current event as the seed, but de-dup similar-past results across all seeds if you choose to seed-per-event.

### 17.3 Concurrency control
Implement a single semaphore (e.g. `p-limit(6)`) at the route level. Share it across all AI calls within a request. Avoids hammering OpenAI when 4 severities × 4 categories + 5 historical tabs × 3 calls fire in the same request.

### 17.4 Logging
Each new route emits one structured log line per OpenAI call: `{ route, category, severity?, durationMs, tokensIn?, tokensOut?, fallbackUsed }`. Helps diagnose slow tabs in production.

### 17.5 Plain-text fallback when AI is off
When `OPENAI_API_KEY` is unset, the deterministic data alone must look complete enough to ship. For Severity Level sub-blocks, use a deterministic one-liner: `"<N> active <category> event(s) at <severity> severity in <state>. Largest: <name> (<key property>: <value>)."`

---

## 18. Out of Scope (do not change)

- AI Confidence calculation.
- Population at Risk calculation.
- Existing ingest pipelines that populate `UnifiedEvent`.
- The dashboard-A endpoint `synthesizeDashboardRiskReport` (used by other surfaces).
- The Continuity/COOP and Operational Signals features in `openai-service.ts`.
