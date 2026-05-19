# Implementation Plan — AI Risk Assessment: Issues & Fixes (Round 2)

> **For:** Claude Sonnet (implementer)
> **Source of requirements:** `doc/readme.md` ("Risk AI Assessment: Issues & Implementation Fixes")
> **Builds on:** the already-implemented live-historical-grounding work (see `doc/risk-ai-historical-implementation-plan.md`). That work is **done** — the `copyFor*` static templates are gone, `risk-historical-feed-service.ts` exists, and the pipeline fetches real USGS/FEMA/NCEI events. This plan fixes the 8 problems found *after* that integration shipped.

---

## 0. Locked-in design decisions

Decided with the product owner — do **not** revisit:

1. **Role scope = keep current behavior.** Only `sub-admin` is hard-locked to their assigned state. `admin`, `super-admin`, and every other allowed role run nationwide unless they explicitly request a single state. Problem 1 work is *enforcement hardening*, not a remapping.
2. **NCEI = block until ready.** On a cold cache the request waits for the NCEI download so storm/tornado past data is never missing. The performance work makes that wait short and crash-free — it does **not** switch to a "serve Data unavailable then backfill" model.
3. **Audience = domain experts.** This report is an operations tool for admins and sub-admins, *not* the general public. The writing style flips from "plain English for ordinary people" to "precise, technical, metric-driven operational intelligence." (Resolves the contradiction in the current `PLAIN_ENGLISH_STYLE_RULES`.)

---

## 1. Current pipeline (what exists today)

Request path: `app/api/risk-assessment/analyze/route.ts`

```
resolveRiskIngestScopeForSession(role, userId, body)   // scope: nationwide vs state
runDashboardIngest({ stateCd, nationwide, ... })       // 8 live feeds → DashboardIngestBundle
  → openaiService.buildHeuristicPreOpenAi(bundle)      // deterministic RiskReport
  → extractCurrentHazardProfile(bundle, heuristic)     // CurrentHazardProfile
  → fetchHistoricalHazardEvents(profile)               // USGS + FEMA + NCEI → HistoricalHazardEvents
  → buildRiskAiOpenAiInput(bundle, heuristic, historical)  // RiskAiOpenAiInput { past, current }
  → Promise.all([ synthesizeDashboardRiskReport(bundle, ai_input),  // OpenAI → RiskReport
                  countReady2GoReachableUsers(...),
                  fetchAlignedAlertCommunicationFeed(...) ])
  → applyRiskReportToAlignedAlertFeed(...)             // KPI alignment
  → buildRiskAiContextPack(report, bundle)             // past/current split for JSON response
```

Key facts the implementer must know:

- The **bar chart** `incident_distribution` is computed by `deriveEventBasedIncidentDistribution(bundle)` in `lib/services/risk-event-distribution.ts` — it dedupes raw NWS/USGS/FEMA/FIRMS/WFIGS/EQ payloads into per-category counts.
- The **`current_procedures`** shown under each Historical Context tab come from `buildLiveHistoricalContext()` → `deriveRealtimeProceduresForIncident()` in `lib/services/risk-historical-context.ts`, which reads `report.meteorological_findings` first and falls back to `nwsBriefLinesForCategory()`.
- These two are **separate code paths** → they disagree (Problem 2).
- The OpenAI call (`synthesizeDashboardRiskReport`) **rewrites** `current_procedures` from a `LIVE_SITUATION` block; if that block is empty for a category it will happily write "No active … reported."
- `PLAIN_ENGLISH_STYLE_RULES` (top of `openai-service.ts`) is used by all three risk-report prompt paths and currently says "read by ordinary members of the public, not specialists."
- `fetchHistoricalHazardEvents` runs all active categories in parallel via `Promise.all`. The NCEI categories (`tornado, storm, hazardous, coastal_surf, marine`) each call `getNceiStormEventsForYear(year)` — see Problem 5 for why this is catastrophic.

---

## 2. Problem 1 — Role-based data scoping (enforcement hardening)

**Status:** `resolveRiskIngestScopeForSession` (`lib/risk-assessment/resolve-ingest-scope.ts`) already locks `sub-admin` to their profile state and lets others go nationwide. Decision 0.1 keeps this mapping. The fixes are bug-level:

### 1.1 Remove the silent `'ca'` fallback for sub-admins
In `resolve-ingest-scope.ts`, when a `sub-admin` has no usable `User.state`, the code currently falls back to `body.stateCd` and then to `'ca'`. A sub-admin must **never** silently receive another state's data.

- If a `sub-admin`'s `User.state` does not normalize to a valid USPS code, do **not** fall back to `body.stateCd` (the client must not widen/redirect scope) and do **not** default to `'ca'`.
- Return a discriminated result the route can detect, e.g. add `unresolved?: boolean` to `ResolvedRiskIngestScope`, or throw a typed error.
- In `route.ts`, when the sub-admin scope is unresolved, return `400` with a clear message (`"Your account has no assigned state — contact an administrator."`) instead of generating a wrong-state report.

### 1.2 Make scope flow through to the historical feed
`extractCurrentHazardProfile` already sets `profile.scope`/`profile.stateCd` from `bundle.ingestScope`/`bundle.stateCd`, and `fetchHistoricalHazardEvents` already honors `profile.scope`. **Verify** (don't assume) that for a `sub-admin`:
- `bundle.ingestScope === 'state'` and `bundle.stateCd` is their USPS code,
- USGS past events use the `STATE_BBOX` geo filter,
- FEMA past events filter by `r.state`,
- NCEI past events filter by `STATE_ABBR_TO_NAME`.

No code change expected here if 1.1 is correct — this is a verification step. Note it in the PR description.

### 1.3 Defense-in-depth in the route
`route.ts` already calls `resolveRiskIngestScopeForSession(role, userId, body)` and uses its result. Confirm the route uses **only** `scope.stateCd` / `scope.nationwide` for the ingest call and never reads `body.stateCd`/`body.nationwide` directly afterward. (It currently looks correct — keep it that way.)

---

## 3. Problem 2 — Live incidents vs. narrative mismatch (bar chart says 13, procedures say "none")

**Root cause:** the bar-chart count and the `current_procedures` lines are produced by two different classifiers over two different inputs, so a category can have a positive bar while its `current_procedures` block is empty. The OpenAI pass then receives `"(no live lines)"` for that category and fabricates `"No active severe storm or wind warnings currently reported nationwide."`

**Fix strategy — one source of truth.** The per-category live event rows that drive the bar chart must also drive `current_procedures`.

### 3.1 Expose per-category live rows from the distribution layer
In `lib/services/risk-event-distribution.ts`, `deriveEventBasedIncidentDistribution` already builds per-category dedupe sets. Add a sibling export that returns, **per category**, the human-readable event lines behind those counts — not just the count:

```ts
export interface IncidentEvidence {
  category: IncidentHistoryCategory;
  count: number;
  /** One readable line per deduped event: "<event> — <area> — <when>" with any
   *  numeric detail (gauge cfs, magnitude, acreage, declaration #) preserved. */
  lines: string[];
}
export function deriveIncidentEvidence(bundle: DashboardIngestBundle): IncidentEvidence[];
```

Reuse the exact iteration/dedupe logic already in `deriveEventBasedIncidentDistribution` (NWS features, USGS gauges, FEMA rows, FIRMS, InciWeb, WFIGS, earthquakes). For each deduped id, also push a readable line into the matching category's `lines[]`. Keep `deriveEventBasedIncidentDistribution` as a thin wrapper that returns `.map(e => ({ category, count }))` over `deriveIncidentEvidence` so **count and lines can never diverge**.

Line content rules (these directly serve Problems 7 & 8 — keep the numbers):
- NWS: `"<event> — <areaDesc> — sent <friendly date>"`.
- USGS gauge / NWPS: include the site/gauge id and the stage/flow figure if present in the summary.
- FEMA: `"<declarationTitle> — declaration #<disasterNumber> — <state>"`.
- Earthquake: `"M<mag> — <place> — <friendly time>"`.
- Wildfire (FIRMS/InciWeb/WFIGS): incident name + acreage/containment/brightness when available.

### 3.2 Feed those rows into `current_procedures`
In `lib/services/risk-historical-context.ts`, change `deriveRealtimeProceduresForIncident` (and therefore `buildLiveHistoricalContext`) so the **primary** source of live lines per category is `deriveIncidentEvidence(bundle)` — the same rows behind the bar chart. The current `meteorological_findings` / `nwsBriefLinesForCategory` logic becomes a secondary enrichment, never a replacement.

Hard invariant after this change: **if a category's bar-chart count > 0, its `current_procedures` array is non-empty.** Add a dev assertion or at minimum a comment documenting the invariant.

### 3.3 Stop the AI from negating an active category
In `openai-service.ts`, the `LIVE_SITUATION` block (built in `generateHistoricalContext`) and the combined-pass context must carry the **count** alongside the lines, and the prompt must forbid negation:

- In `buildCombinedHistoricalSchemaSection` and `generateHistoricalContext`, label each category block with its count, e.g. `storm (13 active incidents):` followed by the evidence lines.
- Add a RULE: *"`current_procedures` describes what is being done about the live incidents listed for that hazard. Every category in ACTIVE_HAZARDS has at least one active incident — NEVER write that a hazard is absent, quiet, or 'not reported'. If the live lines are sparse, describe the monitoring/response posture for the incidents that ARE listed."*

### 3.4 Server-side guard (belt and braces)
In `applyHistoricalAiShape` / `normalizeHistoricalAnalysis` (`openai-service.ts`), after the AI result is merged: for any category with bar-chart count > 0, if the AI's `current_procedures` is empty **or** every bullet matches a negation pattern (`/\bno (active|current|reported)\b|\bnone\b|\bnot reported\b|\bquiet\b/i`), discard the AI text and keep the deterministic live lines from §3.2. This guarantees the UI never shows "none" under a non-zero bar even if the model misbehaves.

---

## 4. Problem 3 — Conditional generation of Historical Context tabs

**Status:** the UI (`HistoricalAnalysisSection` in `app/(admin)/ai-risk-assessment/page.tsx`) already filters tabs to `incidentCategoriesWithPositiveChartCount(report)` **and** `byIncident?.[k]`. The pipeline builds `by_incident` only for active categories. So conditional generation mostly works — but it is fragile because of the Problem 2 split.

**Fix:** once §3 makes "positive count ⇒ non-empty live lines ⇒ `by_incident[cat]` exists" an invariant, tab generation becomes correct by construction. Required steps:

1. Confirm `extractCurrentHazardProfile` derives `activeCategories` from `incidentCategoriesWithPositiveChartCount(heuristic)` (it does) — this is the single gate for which categories get historical fetch + tabs.
2. Confirm `buildRiskAiOpenAiInput` only creates `past.by_incident[cat]` for `activeCats` (it does).
3. In `buildLiveHistoricalContext`, drop the secondary `deriveRealtimeProceduresForIncident(...).length > 0` filter for the `by_incident` map — after §3.2 a positive-count category always has lines, and the extra filter could wrongly hide a valid tab. Gate purely on `distroCountForCategory(report, cat) > 0`.
4. Verify the OpenAI `activeKeys` (used in `buildCombinedHistoricalSchemaSection` and `generateHistoricalContext`) equals the positive-count set. A category with count 0 must never get a tab; a category with count > 0 must always get one.

No new UI work — the UI logic is already correct once the data is consistent.

---

## 5. Problem 4 — "Past Procedures" shows "Data unavailable" although "Past Damages" has events

**Root cause:** NCEI Storm Events rows carry damage/casualty fields but **no response-action field**. The current prompt tells the model to fill `past_procedures` only from `events[].stats.narrative` / `events[].stats.programsActivated`, so for NCEI-sourced events it outputs `"Data unavailable"`. The readme is explicit: an event severe enough to cause damage *did* trigger response procedures.

**Fix — separate the grounding rules for statistics vs. procedures.** Statistics stay strict; procedures become professional-knowledge inference tied to the specific event.

In `openai-service.ts`, update **all three** prompt builders — `formatRiskAiOpenAiInputForPrompt`, `buildCombinedHistoricalSchemaSection`, and `generateHistoricalContext`:

- **`past_damages`** — unchanged grounding: exact figures (deaths, injuries, property/crop damage, federal aid, dates, event names) must come **verbatim** from `events[].stats`. Absent figure ⇒ `"Data unavailable"` for that figure. Never invent a number.
- **`past_procedures`** — new rule: *"For each past event, describe the emergency-response procedures that a hazard of this type and severity requires — warning issuance, evacuation/sheltering, resource staging, damage assessment, federal-assistance activation. Anchor each bullet to the specific event by name and date. For FEMA events, name the actual programs from `stats.programsActivated`. This is established emergency-management practice, not a statistic — you may and should describe it. Do NOT write 'Data unavailable' for past_procedures unless there is genuinely no comparable event."*
- Bullet format stays `"[Event Name] | [Date] | [Procedures]"`.
- Keep the firewall explicit: *casualty counts and dollar figures are statistics (strict, verbatim or "Data unavailable"); response procedures are professional knowledge (describe them).*

Result: every past event with damages also shows concrete past procedures.

---

## 6. Problem 5 — Load times (~3 min) and `UND_ERR_SOCKET` crashes

This is the highest-priority fix. Two distinct failures: a duplicate-download stampede, and unhandled socket errors crashing the dev server.

### 6.1 Root cause A — NCEI duplicate-download stampede
`fetchHistoricalHazardEvents` runs the 5 NCEI categories concurrently in `Promise.all`. Each category calls `fetchNceiPastEvents`, which calls `getNceiStormEventsForYear(year)` for **two** years. The module cache (`nceiCache`) is only populated **after** a download finishes — so all 5 categories × 2 years launch **up to 10 simultaneous downloads of the same 40-60 MB gzip files**, then 10 concurrent gunzip + CSV parses of ~250 MB each. That alone explains the multi-minute resolution time and the memory/socket pressure.

**Fix — in-flight promise de-duplication** in `lib/services/risk-historical-feed-service.ts`:

```ts
const nceiCache = new Map<number, { rows: ParsedStormRow[]; ts: number }>();
const nceiInflight = new Map<number, Promise<ParsedStormRow[]>>();

async function getNceiStormEventsForYear(year: number): Promise<ParsedStormRow[]> {
  const cached = nceiCache.get(year);
  if (cached && Date.now() - cached.ts < NCEI_TTL_MS) return cached.rows;

  const inflight = nceiInflight.get(year);
  if (inflight) return inflight;            // ← all callers share ONE download

  const job = (async () => { /* existing download + gunzip + parse */ })();
  nceiInflight.set(year, job);
  try {
    const rows = await job;
    return rows;
  } finally {
    nceiInflight.delete(year);
  }
}
```

After this, the 5 categories share **one** download per year (2 total), not 10.

### 6.2 Root cause B — unhandled socket error crashes the process
The logs show `uncaughtException: [Error [SocketError]: other side closed] { code: 'UND_ERR_SOCKET' }`. When `fetchWithTimeout` aborts a large in-progress download (15 s timeout vs. a 50 MB file), or when the NCEI/upstream server closes the connection, undici can emit the socket error **after** the awaited promise has already settled — so it surfaces as an `uncaughtException`/`unhandledRejection` with no catch frame, and the dev server dies.

**Fixes (do all three):**

1. **Give large downloads a realistic timeout.** `HIST_FETCH_TIMEOUT_MS` is 15 s for everything. Add a separate, generous budget for the NCEI CSV download (e.g. `NCEI_DOWNLOAD_TIMEOUT_MS = 90_000`) so a healthy-but-large transfer is never aborted mid-stream. Decision 0.2 (block until ready) makes this acceptable. Keep 15 s for the lightweight USGS/FEMA JSON calls and the NCEI **directory** listing.
2. **Fully consume and guard the response body.** Wrap the `res.arrayBuffer()` + `zlib.gunzip` + parse in their own try/catch inside `getNceiStormEventsForYear`; on any failure cache an **empty** result for the year (short TTL) so a transient failure degrades to `"Data unavailable"` rather than retrying every request.
3. **Add a process-level safety net.** In a module that loads once on the server (e.g. top of `risk-historical-feed-service.ts`, guarded so it registers only once), register `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers that **log and swallow** errors whose `code === 'UND_ERR_SOCKET'` (or message includes `other side closed`), and re-throw/exit for anything else. A late socket error from an aborted upstream connection must never take down the server. Keep this handler narrow — only swallow the known-benign socket class.

### 6.3 Disk-persist the parsed NCEI cache (survive restarts)
The dev server restarts frequently; an in-memory-only cache is cold on every restart, so "block until ready" hits the slow path constantly. Persist the parsed rows to disk:

- After a successful parse, write the year's rows to `path.join(os.tmpdir(), 'ready2go-ncei-<year>.json')`.
- **Pre-filter before caching:** keep only rows where `mapEventTypeToCategory(eventType) !== null`. Unmapped event types are never used downstream — dropping them cuts the cached payload (and parse-to-keep cost) substantially.
- On a cold in-memory miss, try the disk file first; if present and younger than `NCEI_TTL_MS`, load it and skip the network entirely.
- Treat disk read/write failures as non-fatal (wrap in try/catch) — disk cache is an optimization, not a dependency.

### 6.4 Only fetch one NCEI year by default
`fetchNceiPastEvents` currently pulls **two** years (`currentYear-1`, `currentYear-2`) and concatenates. The readme wants the most recent comparable events. Fetch `currentYear-1` first; only fall back to `currentYear-2` if year-1 yielded **fewer than 3** events for the requested category after filtering. This halves the cold-path download/parse work in the common case.

### 6.5 Reduce OpenAI latency
- The combined pass uses `max_tokens: 4200`. Keep it, but ensure dual-pass (`OPENAI_RISK_DUAL_PASS`) stays **off** by default — two sequential OpenAI round-trips roughly double the AI latency. Confirm it is not set in any `.env`.
- `formatRiskAiOpenAiInputForPrompt` slices `pastJson` to 8 000 and `currentJson` to 10 000 chars — fine. Do not enlarge the prompt.

### 6.6 Expected outcome
Warm path (disk or memory cache hit): the historical fetch is sub-second; total request time is dominated by `runDashboardIngest` + the single OpenAI call (target well under 60 s). Cold path (first run after a long idle / cache wipe): one NCEI download per year, de-duplicated, ~20-40 s, then warm. No `uncaughtException`. Document the measured before/after in the PR.

---

## 7. Problems 6 & 7 — Generic recommendations / missing statistics (audience = experts)

These two are one change: the report currently writes for "ordinary members of the public" (per `PLAIN_ENGLISH_STYLE_RULES`), but its real readers are emergency-management admins and sub-admins who need precise, quantified, operational intelligence.

### 7.1 Replace the style constant
In `openai-service.ts`, replace the body of `PLAIN_ENGLISH_STYLE_RULES` (or add a new `RISK_REPORT_STYLE_RULES` and switch the 3 references at the `synthesizeDashboardRiskReport` system prompts and the `generateHistoricalContext` system prompt). New rules:

```
WRITING STYLE — this report is an operational intelligence product for emergency-management
administrators and state sub-administrators. Write for a domain expert, not the public:
- Be specific, technical, and quantified. Every finding, procedure, damage line, future
  measure, and recommendation must carry concrete detail: exact counts, dollar figures,
  casualty numbers, gauge readings (cfs / flood stage), earthquake magnitudes and depth,
  acreage and containment %, dates and times, county/place names, and FEMA disaster numbers.
- NO PLATITUDES. Ban generic filler such as "coordinate with local health and emergency
  services", "monitor the situation", "raise public awareness", "stay prepared". Every
  sentence must name a specific action, asset, threshold, or decision point.
- Each recommendation/measure states WHAT to do, WHERE (named jurisdiction), with WHICH
  resource or trigger, and by WHEN. Example of the required specificity:
  "Pre-stage swift-water rescue teams in Clinton and DeWitt counties, Illinois before the
   Salt Creek gauge crosses 18 ft (forecast within 6 hours)."
- Technical terms, agency names, and program names are EXPECTED and may be used directly
  (NWS, USGS, FEMA IA/PA, NWPS, FIRMS, EOC, ICS). Do not water them down.
- Still write complete, readable sentences — precision, not jargon soup. Never output raw
  GPS coordinates.
```

> This deletes the old plain-English mandate. `PLAIN_ENGLISH_STYLE_RULES` is referenced **only** by the three risk-report prompt paths (verified) — repurposing it is safe and does not affect other AI features.

### 7.2 Demand statistics in every section
Update the schema/RULES text in `formatRiskAiOpenAiInputForPrompt`, `buildCombinedHistoricalSchemaSection`, the `schemaHint` in `synthesizeDashboardRiskReport`, and the `generateHistoricalContext` system prompt so each list explicitly requires quantified content:

- `meteorological_findings` / `hydrological_findings` / `fire_findings`: every bullet cites a measured value (magnitude, cfs, stage, acreage, wind speed, alert count) and a named location.
- `current_procedures`: tie each line to the live incident count and the specific incidents from §3 (e.g. *"13 active storm warnings across … — …"*).
- `past_damages`: exact figures from `events[].stats` (already strict — keep).
- `recommendations_list`: each `action` must name a jurisdiction, a resource/trigger, and a timing. Reinforce the existing IMMEDIATE (0-2 h life-safety) / URGENT (2-12 h staging) / STANDARD (>12 h monitoring) tiers, and require that each recommendation is a concrete translation of a `future_measures` item — not a restatement of it in vaguer words.
- `future_measures`: specific mitigation/preparedness actions with named systems and measurable goals — no household-tip language (the old `generateHistoricalContext` prompt literally says *"for a community or household"* and *"Never policy or infrastructure jargon"* — **remove those lines**).

### 7.3 Make sure the data carries the numbers
`current_procedures` can only be quantified if the live lines fed to the AI contain numbers. §3.1's line-content rules (keep gauge cfs, magnitude, acreage, declaration #) are what make Problem 7 achievable for the "current" half. Verify the evidence lines are not stripped of digits anywhere between `deriveIncidentEvidence` and the prompt.

---

## 8. Problem 8 — Formatting & visual emphasis

The UI already renders AI `**bold**` spans (`renderFindingEmphasis` in `app/(admin)/ai-risk-assessment/page.tsx`) and auto-emphasizes measurements. The gap is that emphasis is inconsistent and critical numbers often arrive unbolded.

### 8.1 Prompt — bold every critical token
In the FORMATTING section of the `generateHistoricalContext` system prompt and `buildCombinedHistoricalSchemaSection`, tighten the rule: *"Wrap in `**double asterisks**` every critical token — all dollar amounts, casualty counts, dates/times, magnitudes, gauge readings, acreage, containment %, incident counts, severity words, and place names. A reader scanning only the bold text must still grasp the key facts."* Apply this to executive findings and `recommendations_list` actions too, not just Historical Context.

### 8.2 UI — emphasize severity in recommendations and damages
Light-touch changes in `app/(admin)/ai-risk-assessment/page.tsx`:
- In the `recommendations_list` renderer (~line 1106), the `IMMEDIATE`/`URGENT`/`STANDARD` pill + colored left border already exist — verify `IMMEDIATE` reads as visually loudest (red border + filled red badge). Adjust `priorityMeta` colors only if `IMMEDIATE` is not clearly dominant.
- In `HistoricalQuadrant` for "Past Damages & Losses", ensure numeric tokens inside each bullet are emphasized — the existing auto-emphasize for measurements should cover dollar/casualty figures; verify patterns like `$2.9M`, `4 deaths`, `12 injuries`, `declaration #4906` are caught, and extend the auto-emphasize regex if not.
- Do **not** redesign the layout. This is emphasis tuning, not a rebuild.

Keep `stripEmphasisMarkers` working for the PDF export path (jsPDF can't render inline bold) — don't break it.

---

## 9. Implementation order

1. **Problem 5 first** (§6) — it is causing crashes and 3-minute requests; nothing else can be tested reliably until the server stops dying. In-flight dedup → socket safety net → timeouts → disk cache → single-year default.
2. **Problem 1** (§3? no — §2 of this doc) — scope hardening in `resolve-ingest-scope.ts` + `route.ts`.
3. **Problem 2** (§3) — `deriveIncidentEvidence` in `risk-event-distribution.ts`, rewire `deriveRealtimeProceduresForIncident` / `buildLiveHistoricalContext`, prompt count labels, server-side negation guard.
4. **Problem 3** (§4) — drop the redundant secondary filter; verify the positive-count⇔tab invariant.
5. **Problems 6 & 7** (§7) — swap the style constant; quantify every section in all prompt builders.
6. **Problem 4** (§5) — split statistics-vs-procedures grounding in the prompts.
7. **Problem 8** (§8) — prompt emphasis rule + minor UI emphasis tuning.
8. Typecheck (`npx tsc --noEmit`) and a manual end-to-end run.

Problems 4, 6, 7, 8 all edit prompt strings in `openai-service.ts` — batch those edits to avoid churn, but land them as logically separate commits.

---

## 10. Files touched (summary)

| File | Problems | Change |
|---|---|---|
| `lib/services/risk-historical-feed-service.ts` | 5 | In-flight dedup, socket safety net, NCEI timeout, disk cache, single-year default |
| `lib/risk-assessment/resolve-ingest-scope.ts` | 1 | Remove `'ca'` fallback for sub-admins; signal unresolved scope |
| `app/api/risk-assessment/analyze/route.ts` | 1 | 400 on unresolved sub-admin scope |
| `lib/services/risk-event-distribution.ts` | 2, 3 | New `deriveIncidentEvidence` (count + lines); `deriveEventBasedIncidentDistribution` becomes a wrapper |
| `lib/services/risk-historical-context.ts` | 2, 3 | `deriveRealtimeProceduresForIncident` / `buildLiveHistoricalContext` use evidence rows; gate `by_incident` on count only |
| `lib/services/openai-service.ts` | 2, 4, 6, 7, 8 | Replace style constant; per-category counts in prompts; statistics-vs-procedures split; quantification rules; emphasis rule; negation guard in `applyHistoricalAiShape`/`normalizeHistoricalAnalysis` |
| `app/(admin)/ai-risk-assessment/page.tsx` | 8 | Minor emphasis tuning (recommendations pill, damages auto-emphasis) |

No type changes are required — `PastHazardEvent`, `RiskAiPastBlock`, `HistoricalAnalysis` already carry every field needed. (`ResolvedRiskIngestScope` gets one optional `unresolved` flag.)

---

## 11. Verification

- `npx tsc --noEmit` passes (no new errors in the touched files).
- **Problem 5:** trigger `POST /api/risk-assessment/analyze` twice. Cold run completes without `uncaughtException` and well under the old ~180 s; the warm run is markedly faster (disk/memory cache hit). The dev server does not crash. Record before/after timings.
- **Problem 1:** a `sub-admin` request returns only their state's data; a sub-admin with no assigned state gets a clean `400`, not California data.
- **Problem 2:** for every category with a non-zero bar, the Historical Context tab's "Current Procedures" is non-empty and never says "no active … reported". Storm count 13 ⇒ storm current procedures describe the 13 incidents.
- **Problem 3:** a category with bar count 0 has no tab; every category with count > 0 has a tab.
- **Problem 4:** every past event listed under "Past Damages" has matching, concrete "Past Procedures" content — no "Data unavailable" in the procedures column when damages exist.
- **Problems 6/7:** recommendations and future measures name jurisdictions, resources, triggers, and timing; no generic platitudes; findings and procedures carry exact numbers.
- **Problem 8:** critical numbers, dates, places, and severity words render bold in the UI; PDF export still prints with no literal `**` markers.

---

## 12. Risks & notes

- **NCEI remains the fragility point.** The in-flight dedup + disk cache + socket safety net make it robust, but if NCEI itself is down, the graceful path must still return the report with `"Data unavailable"` for storm/tornado/marine past data — verify `sourceStatus` records the failure and the report still returns `200`.
- **Disk cache location:** `os.tmpdir()` is fine for dev and most deploys; if the app runs on a read-only or ephemeral filesystem, the disk-cache writes simply fail and fall back to network — that's the intended degradation, do not make it fatal.
- **Style flip is intentional and total.** After §7 the report is no longer "plain English for the public." If any other surface reuses `PLAIN_ENGLISH_STYLE_RULES`, re-grep before editing — current grep shows only the three risk-report prompts use it.
- **Negation guard (§3.4)** is a safety net, not a license to skip §3.1-§3.3 — fix the data path first; the guard only catches a misbehaving model.
- Do not reintroduce the deleted `copyFor*` static templates anywhere — past context stays 100% live-API-grounded.
