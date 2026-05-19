# Implementation Plan — Live Historical Grounding for AI Risk Assessment

> **For:** Claude Sonnet (implementer)
> **Source of requirements:** `~/Downloads/readme.md` ("Risk Analysis & Historical Context Generation Plan")
> **Goal:** Replace the static playbook prose that currently feeds the AI's "past" context with **real historical events pulled live from public APIs**, and enforce strict, statistic-grounded, no-hallucination output.

---

## 1. Objective

The AI Risk Assessment report must stop using generic, hand-written hazard prose for its historical sections. Instead:

1. **Past data** (`past_damages`, `past_procedures`) must come from **real past events** — exact event name, date/time, dollar losses, casualty counts — fetched live from historical APIs.
2. Past events must be **selected by similarity** to the current live incident (e.g. a live M6.0 earthquake pulls the most recent 3–4 past quakes of comparable magnitude; a live tornado pulls comparable past tornadoes).
3. **Current data** (`current_procedures`) stays grounded only in the live ingest — unchanged in spirit.
4. **`future_measures`** is synthesized by comparing past outcomes against the current trajectory.
5. **`recommendations_list`** is derived from `future_measures` as a prioritized action plan (`IMMEDIATE` / `URGENT` / `STANDARD`).
6. The model must **never invent** statistics. Missing metric → literal string `"Data unavailable"`.

## 2. Locked-in design decisions

These were decided with the product owner — do **not** revisit them:

- **Past data source = live historical APIs only.** No new MongoDB collection. (USGS earthquake archive, NOAA NCEI Storm Events, expanded FEMA OpenFEMA.)
- **The static `copyFor*` playbook templates are removed entirely.** When no similar past event is found for a hazard, output `"Data unavailable"` — do not fall back to generic prose.

## 3. Current architecture (what exists today)

Request path: `app/api/risk-assessment/analyze/route.ts`

```
runDashboardIngest(bundle)                         // live feeds → DashboardIngestBundle
  → openaiService.buildHeuristicPreOpenAi(bundle)  // deterministic RiskReport
  → buildRiskAiOpenAiInput(bundle, heuristic)      // → RiskAiOpenAiInput { past, current }
  → openaiService.synthesizeDashboardRiskReport(bundle, ai_input)  // OpenAI → RiskReport
  → buildRiskAiContextPack(report, bundle)         // splits final report back into past/current for the JSON response
```

Key facts about the current code:

- **`lib/risk-assessment/build-ai-input-from-bundle.ts`** builds `past` by calling `playbookPastBlockForCategory()` → `copyFor*()` static templates in `risk-historical-context.ts`. The only real data injected is FEMA flood-declaration lines, and only for the `flood` category. **This is the function to rewrite.**
- **`lib/services/risk-historical-context.ts`** contains the `copyFor{Flood,Wildfire,SevereWeather,Earthquake,Tornado,Storm,HazardousSurface,CoastalSurf,Marine,Multi,Baseline}` template functions plus `playbookForIncident`, `playbookPastBlockForCategory`, `pickArchetype`, `buildHistoricalAnalysisFromReport`, `buildHistoricalAnalysisByIncident`, `applyHistoricalContextToReport`. **These are the functions to delete.**
- **`lib/services/openai-service.ts`**:
  - `formatRiskAiOpenAiInputForPrompt()` (~line 673) renders `PAST_CONTEXT` / `CURRENT_CONTEXT` JSON into the prompt.
  - `synthesizeDashboardRiskReport()` (~line 694) — the combined single-pass OpenAI call (default). Its `schemaHint` + system prompt must be updated.
  - `generateHistoricalContext()` (~line 815) — dedicated historical pass, used only when `OPENAI_RISK_DUAL_PASS=true`. Its system prompt currently says *"do not fabricate specific named past disasters"* — this directly contradicts the new requirement and must be rewritten.
- **`lib/services/risk-ingest-service.ts`** has `ingestFemaFloods()` (~line 505) using OpenFEMA `DisasterDeclarationsSummaries` filtered to `incidentType eq 'Flood'`.

**Verified:** `applyHistoricalContextToReport`, `buildHistoricalAnalysisFromReport`, `buildHistoricalAnalysisByIncident`, `playbookForIncident`, `playbookPastBlockForCategory` are referenced **only** inside `risk-historical-context.ts` and `build-ai-input-from-bundle.ts`. Safe to delete once `build-ai-input-from-bundle.ts` is rewritten. Still, re-grep before deleting.

## 4. Target architecture

```
runDashboardIngest(bundle)
  → buildHeuristicPreOpenAi(bundle)                    // unchanged
  → extractCurrentHazardProfile(bundle, heuristic)     // NEW — current magnitudes/severities per category
  → fetchHistoricalHazardEvents(profile, scope)        // NEW — live API fetch + similarity selection
  → buildRiskAiOpenAiInput(bundle, heuristic, events)  // REWRITTEN + now async — past = real events
  → synthesizeDashboardRiskReport(bundle, ai_input)    // prompt updated for strict grounding
  → buildRiskAiContextPack(report, bundle)             // unchanged (passes report fields through)
```

### Design rule — server pre-formats the hard numbers

To guarantee "NO HALLUCINATIONS", the **server**, not the model, builds the exact-statistic bullet strings:

- The server fetches structured `PastHazardEvent` objects and renders each `past_damages` / `past_procedures` bullet as `"[Event Name] | [Date/Time] | [Damages/Procedures]"`.
- These pre-formatted strings are placed into `RiskAiPastBlock.past_damages` / `past_procedures` and passed to the model.
- The model is instructed it **may lightly reword for plain English but MUST NOT add or alter any number, date, or event name**, and must keep `"Data unavailable"` verbatim where present.
- The model still authors `matched_event`, `similarity_summary`, `future_measures` (synthesis), `current_procedures` (from live ingest), and `recommendations_list`.

This keeps statistics deterministic and auditable while leaving genuine synthesis to the model.

## 5. New files

### 5.1 `lib/risk-assessment/extract-current-hazard-profile.ts`

Derives the current intensity signal per hazard category, used to drive similarity matching.

```ts
export interface CurrentHazardProfile {
  scope: 'nationwide' | 'state';
  stateCd: string;            // 'us' for nationwide
  activeCategories: IncidentHistoryCategory[];   // categories with positive bar-chart count
  earthquakeMaxMagnitude?: number;               // max M from USGS_EARTHQUAKES features
  tornadoMaxEf?: number;                         // EF tier if parseable from NWS alert params
  stormMaxWindMph?: number;                      // if parseable
  wildfireMaxFrp?: number;                       // max FIRMS FRP if available
  domainSeverities: DomainSeverities;
}

export function extractCurrentHazardProfile(
  bundle: DashboardIngestBundle,
  heuristic: RiskReport,
): CurrentHazardProfile
```

Implementation notes:
- `activeCategories` = `incidentCategoriesWithPositiveChartCount(heuristic)` (already exported from `risk-historical-context.ts`).
- `earthquakeMaxMagnitude`: read the `USGS_EARTHQUAKES` source from `bundle.sources`; its raw `data` is GeoJSON — take `max(features[].properties.mag)`. If parsing the raw data is awkward, parse magnitudes out of the source `summary` lines with a regex (`/\bM\s?(\d+(?:\.\d+)?)/i`).
- Tornado/storm intensity is best-effort — NWS alert payloads do not always carry EF/wind. If unavailable, leave undefined; similarity falls back to "same event type, most recent".
- This function must be pure and synchronous.

### 5.2 `lib/services/risk-historical-feed-service.ts`

The core new service. Fetches past events from live APIs, selects by similarity, normalizes to a common shape.

```ts
export interface PastHazardEvent {
  category: IncidentHistoryCategory;
  eventName: string;          // "Hurricane Delta", "M6.4 — 11km W of Ridgecrest, CA"
  occurredAt: string;         // friendly date, e.g. "October 9, 2020"
  location: string;           // state / region / county
  magnitude?: string;         // "M6.4" | "EF3" | "70 mph wind" | "2.5 in hail"
  damages: string;            // "$2.9B property; 4 deaths; 12 injuries" OR "Data unavailable"
  procedures: string;         // response actions if the source provides them, else "Data unavailable"
  source: 'USGS_ARCHIVE' | 'NCEI_STORM_EVENTS' | 'FEMA_OPENFEMA';
  sourceUrl?: string;
}

export interface HistoricalHazardEvents {
  by_incident: Partial<Record<IncidentHistoryCategory, PastHazardEvent[]>>;
  fetchedAt: string;
  sourceStatus: { source: string; ok: boolean; error?: string }[];
}

export async function fetchHistoricalHazardEvents(
  profile: CurrentHazardProfile,
): Promise<HistoricalHazardEvents>
```

Per-category fetchers inside this file (all must be individually try/catch-wrapped — one source failing must never abort the others):

| Category | Source | Endpoint / approach |
|---|---|---|
| `earthquake` | USGS ANSS ComCat archive | `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=...&endtime=...&minmagnitude=...&maxmagnitude=...&orderby=time&limit=20` |
| `flood`, `wildfire` | FEMA OpenFEMA | `DisasterDeclarationsSummaries` joined with `FemaWebDisasterSummaries` on `disasterNumber` |
| `tornado`, `storm`, `hazardous`, `coastal_surf`, `marine` | NOAA NCEI Storm Events Database | per-year `details` CSV (see §6.2) |

Each fetcher returns `PastHazardEvent[]` already similarity-filtered to **3–4 events** per the readme. Then `fetchHistoricalHazardEvents` assembles `by_incident` for the `profile.activeCategories` only.

## 6. Historical API integration detail

### 6.1 USGS earthquake archive (`earthquake`)

- Base: `https://earthquake.usgs.gov/fdsnws/event/1/query`
- Params: `format=geojson`, `orderby=time` (most recent first), `limit=20`, `starttime` = ~25 years ago, `endtime` = today.
- **Similarity:** if `profile.earthquakeMaxMagnitude` is known, set `minmagnitude = mag - 0.7` and `maxmagnitude = mag + 0.7`. If unknown, use `minmagnitude = 5.0` (notable quakes only).
- **Geographic scope:** when `profile.scope === 'state'`, constrain with a bounding box for the state (`minlatitude/maxlatitude/minlongitude/maxlongitude`). Add a small static state-bbox lookup, or reuse any existing state-bounds helper if one exists (grep `boundingBox` / `bbox`). Nationwide → no geo filter.
- Take the **most recent 3–4** results after filtering.
- **Damages/casualties:** the summary GeoJSON has no loss data. For each selected event, optionally fetch its detail (`properties.detail` URL) and read the PAGER product (`properties.products.losspager` → `properties` has `alertlevel`, and `maxmmi`; PAGER also exposes fatality/economic loss histogram ranges). If detail fetch is skipped for latency, set `damages` to `"Estimated shaking M{mag}, depth {km} km; loss figures: Data unavailable"`. **Decision: fetch PAGER detail only for events with `alert` flag present in the summary `properties.alert`** (summary features include `properties.alert` = green/yellow/orange/red). This limits extra requests.
- `procedures` from USGS = `"Data unavailable"` (USGS does not record response actions).
- `eventName` = `M{mag} — {place}`; `occurredAt` from `properties.time` (epoch ms → friendly date); `location` = `properties.place`.

### 6.2 NOAA NCEI Storm Events Database (`tornado`, `storm`, `hazardous`, `coastal_surf`, `marine`)

This is the **highest-effort and highest-risk** integration. It is the only public source with exact past **dollar damages and casualty counts** for tornadoes/storms.

- NCEI publishes per-year `details` CSVs (gzip) at:
  `https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/`
- Filenames look like `StormEvents_details-ftp_v1.0_d2023_c20240117.csv.gz` — the compile-date suffix is not predictable.
- **Approach:**
  1. `GET` the directory index HTML, regex out `StormEvents_details-ftp_v1.0_d{YEAR}_c\d+\.csv\.gz` filenames, pick the latest compile for the **two most recent fully-published years**.
  2. Fetch each `.gz`, gunzip (`zlib.gunzipSync` / streaming), parse CSV.
  3. Relevant columns: `EVENT_TYPE`, `BEGIN_DATE_TIME`, `STATE`, `CZ_NAME`, `DEATHS_DIRECT`, `INJURIES_DIRECT`, `DAMAGE_PROPERTY` (e.g. `"2.90M"`, `"15.00K"`), `DAMAGE_CROPS`, `TOR_F_SCALE`, `MAGNITUDE` (wind/hail), `EVENT_NARRATIVE`.
  4. Map `EVENT_TYPE` → our `IncidentHistoryCategory` (Tornado→`tornado`; Thunderstorm Wind/Hail/Hurricane→`storm`; Winter Storm/Ice/Extreme temp/High Wind/Dense Smoke→`hazardous`; Coastal Flood/Rip Current/High Surf→`coastal_surf`; Marine */Waterspout/Marine wind→`marine`).
- **Caching is mandatory** — do not download CSVs per request. Use a **module-level in-memory cache** keyed by year with a TTL of ~12 hours (`Map<number, ParsedStormEvent[]>` + timestamp). First request populates it; subsequent requests reuse. This is in-process memory, not a database — consistent with the "no DB" decision.
- **Similarity:** filter parsed rows by category, by `STATE` when `profile.scope === 'state'`, and by intensity tier when known (tornado: same `TOR_F_SCALE` tier; storm wind: comparable `MAGNITUDE`). Sort by date desc, take 3–4.
- **Damages string:** parse `DAMAGE_PROPERTY` / `DAMAGE_CROPS` magnitude suffixes (`K`/`M`/`B`) into a clean figure; combine with deaths/injuries: `"$2.9M property damage; 4 deaths; 12 injuries"`. If all are zero/blank → `"Data unavailable"`.
- `procedures`: NCEI has no response-action field → `procedures = "Data unavailable"` unless `EVENT_NARRATIVE` mentions response (do **not** over-engineer; default `"Data unavailable"`).
- **Graceful degradation:** if the directory listing or any CSV fetch fails, log it, return `[]` for those categories, and record the failure in `sourceStatus`. The report must still generate.

### 6.3 FEMA OpenFEMA — expanded (`flood`, `wildfire`)

- Reuse the existing `FEMA_BASE` constant from `risk-ingest-service.ts`.
- Endpoint 1: `DisasterDeclarationsSummaries?$filter=incidentType eq 'Flood'&$orderby=declarationDate desc&$top=...` — and a parallel call for `incidentType eq 'Fire'` for the `wildfire` category. Filter by state when scoped (the existing `femaRowMatchesState` helper in `risk-ingest-service.ts` already does this — export and reuse it, or replicate the logic).
- Endpoint 2 (NEW): `FemaWebDisasterSummaries?$filter=disasterNumber eq {n}` per selected disaster, or batch with an `in`-style filter. This table carries dollar figures: `totalAmountIhpApproved`, `totalAmountHaApproved`, `totalAmountPaApproved`, `totalNumberIaApproved`. Join on `disasterNumber`.
- `damages` = e.g. `"$14.2M Individual & Households Program approved; 3,104 applications approved"`. If `FemaWebDisasterSummaries` has no row → `"Federal assistance figures: Data unavailable"`.
- `procedures` = `"Federal disaster declared {date}; Public Assistance and Individual Assistance programs activated"` — this is factual from the declaration record (`ihProgramDeclared`, `paProgramDeclared` booleans). If those are false → `"Data unavailable"`.
- `eventName` = `declarationTitle`; `occurredAt` = `incidentBeginDate` (friendly); `location` = `state` + `designatedArea` if present.
- Take the most recent 3–4 per category.

## 7. Type changes — `lib/types/risk-assessment.ts`

Add:

```ts
/** A single real past event resolved from a live historical API. */
export interface PastHazardEvent {
  category: IncidentHistoryCategory;
  eventName: string;
  occurredAt: string;
  location: string;
  magnitude?: string;
  damages: string;
  procedures: string;
  source: 'USGS_ARCHIVE' | 'NCEI_STORM_EVENTS' | 'FEMA_OPENFEMA';
  sourceUrl?: string;
}
```

Extend `RiskAiPastBlock` with an optional structured field so the events travel alongside the pre-formatted strings:

```ts
export interface RiskAiPastBlock {
  matched_event?: string;
  similarity_summary?: string;
  past_damages?: string[];
  past_procedures?: string[];
  future_measures?: string[];
  events?: PastHazardEvent[];   // NEW — structured source data for auditing/UI
}
```

`CurrentHazardProfile` lives in its own file (§5.1) but may be exported from the types file instead if preferred for consistency — implementer's choice; keep it in one place.

## 8. Rewrite — `lib/risk-assessment/build-ai-input-from-bundle.ts`

- Change `buildRiskAiOpenAiInput` to **`async`** and add a third parameter `historical: HistoricalHazardEvents`.
- Delete the `playbookPastBlockForCategory` import and the `pastBlockForCategory` helper.
- For each active category, build the `RiskAiPastBlock` from `historical.by_incident[cat]`:
  - `events` = the raw `PastHazardEvent[]`.
  - `past_damages` = `events.map(e => `${e.eventName} | ${e.occurredAt} | ${e.damages}`)`.
  - `past_procedures` = `events.map(e => `${e.eventName} | ${e.occurredAt} | ${e.procedures}`)`.
  - `matched_event` / `similarity_summary` / `future_measures` = leave **undefined** — the model authors these.
  - If `events` is empty → `past_damages = ['Data unavailable']`, `past_procedures = ['Data unavailable']`.
- `past.rollup` = the block for the highest bar-chart-count active category (keep the existing `rollupCat` selection logic).
- Keep `fema_flood_declarations` on `RiskAiPastContext` (still populated from the bundle as today).
- The `current` half of the function is unchanged.

## 9. Route change — `app/api/risk-assessment/analyze/route.ts`

- After `buildHeuristicPreOpenAi`, add:
  ```ts
  const profile = extractCurrentHazardProfile(bundle, heuristic);
  const historical = await fetchHistoricalHazardEvents(profile);
  const ai_input = await buildRiskAiOpenAiInput(bundle, heuristic, historical);
  ```
- **Remove the four `console.log` debug blocks** (lines ~70–74 and ~115–119, the `--- BUNDLE PRE-AI ---` / `--- AI_INPUT ---` / `--- EXTRACTED ... CONTEXT ---` dumps). They are debugging leftovers that print huge JSON on every request.
- Optionally add `historical.sourceStatus` into the `ingest` object of the JSON response so the UI/operators can see which historical feeds succeeded.
- Latency: `fetchHistoricalHazardEvents` runs serially before `synthesizeDashboardRiskReport` (the AI input depends on it). The NCEI CSV cache (§6.2) keeps the warm-path cost low. USGS/FEMA calls are fast; give each `fetchWithTimeout`-style call a ~12s timeout and degrade to `"Data unavailable"` on timeout.

## 10. Prompt changes — `lib/services/openai-service.ts`

### 10.1 `formatRiskAiOpenAiInputForPrompt`

Rewrite the `RULES` block to embed the readme's grounding rules:

```
RULES
- past_damages / past_procedures: these bullets are PRE-FORMATTED from real historical
  records as "Event | Date | Statistics". You MAY reword for plain English, but you MUST
  NOT add, remove, or change any number, dollar figure, date, or event name. Keep the
  literal text "Data unavailable" wherever it appears.
- NO VAGUE GENERALIZATIONS: never write "many", "significant", "large amounts". Use the
  exact numbers and dates from PAST_CONTEXT and CURRENT_CONTEXT only.
- NO HALLUCINATION: if a metric is absent, write "Data unavailable" — never invent a
  realistic-looking substitute.
- matched_event / similarity_summary: explain, in plain words, why the selected past
  events resemble the current situation.
- current_procedures: ground ONLY in CURRENT_CONTEXT live ingest.
- future_measures: synthesize PAST_CONTEXT outcomes against CURRENT_CONTEXT trajectory —
  concrete, practical mitigation steps.
- recommendations_list: translate future_measures into a prioritized action plan
  (see schema). IMMEDIATE = life-safety within 0-2h; URGENT = staging/mitigation within
  2-12h; STANDARD = monitoring/logistics beyond 12h.
```

### 10.2 `synthesizeDashboardRiskReport` — `schemaHint` + system prompt

- In `schemaHint`, change the `recommendations_list` line to explicitly state it must be the prioritized translation of `future_measures` with the 0-2h / 2-12h / 12h+ rule.
- In `buildCombinedHistoricalSchemaSection`, the per-`BLOCK` description must instruct: `past_damages` and `past_procedures` come **verbatim (statistics-preserved)** from `PAST_CONTEXT`; only `matched_event`, `similarity_summary`, `future_measures` are authored; `current_procedures` from live data.
- Keep `PLAIN_ENGLISH_STYLE_RULES` — plain-English output is still required. The two requirements coexist: keep exact numbers, but explain technical terms (the style block already covers this).

### 10.3 `generateHistoricalContext` (dual-pass path)

- This pass currently receives **no** `past` context and explicitly tells the model *"do not fabricate specific named past disasters"*. Both must change.
- Pass the `HistoricalHazardEvents` into this method (thread it through from `synthesizeDashboardRiskReport`, which already has `aiInput`). Add a `HISTORICAL_EVENTS` section to the `user` prompt listing the pre-formatted `Event | Date | Statistics` lines per category.
- Rewrite the `GROUNDING` paragraph of the `system` prompt: `past_damages` / `past_procedures` MUST be built from `HISTORICAL_EVENTS` only, statistics preserved; `"Data unavailable"` where a category has no events; never invent.
- Note: dual-pass is opt-in (`OPENAI_RISK_DUAL_PASS=true`) and the combined pass is the default — prioritize §10.1/§10.2, but do not leave the dual-pass prompt self-contradictory.

## 11. Removal checklist — `lib/services/risk-historical-context.ts`

Re-grep each symbol across `**/*.ts(x)` first, then delete:

- `copyForFlood`, `copyForWildfire`, `copyForSevereWeather`, `copyForEarthquake`, `copyForTornado`, `copyForStorm`, `copyForHazardousSurface`, `copyForCoastalSurf`, `copyForMarine`, `copyForMulti`, `copyForBaseline`
- `playbookForIncident`, `playbookPastBlockForCategory`
- `buildHistoricalAnalysisFromReport`, `buildHistoricalAnalysisByIncident`, `applyHistoricalContextToReport`
- `pickArchetype`, `HazardArchetype` type, and `buildRollupCurrentProcedures`'s archetype branches **only if** they become unused after the above are gone (`buildLiveHistoricalContext` uses `pickArchetype` + `buildRollupCurrentProcedures` — **these stay**). Re-check before removing anything in this group.
- The `ST()` state-label helper is used only by `copyFor*` — remove it if no other reference remains.

**Keep** (still used by the live pipeline): `isNoiseIngestFindingLine`, `distroCounts`, `incidentCategoriesWithPositiveChartCount`, `incidentDistributionRowsAligned`, `deriveRealtimeProceduresForIncident`, `buildLiveHistoricalContext`, `pickDefaultHistoricalTab`, `matchConfidence`, `INCIDENT_HISTORY_TAB_LABELS`, `isLikelyEarthquakeBullet`, `classifyMeteorologicalLineToTab`, and the NWS/earthquake brief-line helpers.

After deletion, run `tsc --noEmit` (or the project's typecheck) to catch any missed reference.

## 12. Edge cases & "Data unavailable" handling

- A category in `activeCategories` with **zero** fetched events → `past_damages`/`past_procedures` = `['Data unavailable']`. The model must keep it literal and must not invent.
- An event with a known name/date but missing dollar figure → the figure portion is `"Data unavailable"`, the name/date are still shown.
- All historical sources fail (network) → report still generates; every active category shows `"Data unavailable"` for past fields; `current_procedures` and KPIs are unaffected.
- Nationwide vs state scope (`profile.scope`) controls geographic filtering on every fetcher.
- Never emit raw GPS coordinates in any output (existing `PLAIN_ENGLISH_STYLE_RULES` constraint).

## 13. Implementation order (suggested)

1. Add `PastHazardEvent` + `RiskAiPastBlock.events` to `lib/types/risk-assessment.ts`.
2. Create `extract-current-hazard-profile.ts` (§5.1).
3. Create `risk-historical-feed-service.ts` (§5.2, §6) — implement FEMA fetcher first (simplest), then USGS, then NCEI. Each behind its own try/catch.
4. Rewrite `build-ai-input-from-bundle.ts` (§8) — make async, consume `HistoricalHazardEvents`.
5. Update `route.ts` (§9) — wire the new calls, remove debug logs.
6. Update the three prompt areas in `openai-service.ts` (§10).
7. Delete the `copyFor*` / playbook functions from `risk-historical-context.ts` (§11).
8. Typecheck + build; fix references.

## 14. Verification

- `npm run build` / typecheck passes with no unused-import or missing-reference errors.
- Trigger `POST /api/risk-assessment/analyze` (nationwide and a single state). Confirm in the JSON response:
  - `past.by_incident.<cat>.past_damages` bullets follow `Event | Date | Statistics` and contain **real** event names from the APIs (not the old generic prose).
  - Earthquake past events are magnitude-clustered around the current live quake when one is active.
  - Categories with no historical match show `"Data unavailable"`.
  - `recommendations_list` items carry `IMMEDIATE`/`URGENT`/`STANDARD` and read as a step-by-step plan derived from `future_measures`.
- Force a historical-API failure (e.g. temporarily break the NCEI URL) and confirm the report still returns 200 with `"Data unavailable"` rather than erroring.
- Confirm no `console.log` JSON dumps remain in `route.ts`.

## 15. Risks & notes

- **NCEI Storm Events is the main risk.** There is no fine-grained query API — the integration depends on directory-listing scraping + per-year CSV download + gunzip + parse. Budget the most time here. If it proves unreliable in practice, the graceful-degradation path (§6.2) keeps the feature working with FEMA + USGS only; tornado/storm past data would then show `"Data unavailable"` until NCEI is stabilized. Do **not** let NCEI difficulty block the other two integrations.
- **Latency:** the historical fetch is on the critical path before the OpenAI call. The NCEI in-memory cache is what keeps warm requests fast — make sure the cache is module-scoped (survives across requests in the same server process), not request-scoped.
- **USGS PAGER detail fetches** add one request per alert-flagged quake — cap the number of detail fetches (e.g. max 4) and timeout each.
- Keep all outward fetches behind a timeout helper (mirror the existing `fetchWithTimeout` in `risk-ingest-service.ts`).
