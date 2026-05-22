# AI Risk Assessment — Fixes & Enhancements Implementation Plan

This document is the complete, step-by-step implementation guide for Claude Code to execute every fix and enhancement described in `docs/risk-assessment-fixes.md`. Each section maps to one fix, lists the exact files to change, the precise code logic to apply, and the order of operations.

---

## Prerequisites — Read These Files First

Before making any change, read the following files in full so the context is fresh:

1. `app/(admin)/ai-risk-assessment/page.tsx`
2. `lib/services/openai-service.ts`
3. `lib/types/risk-assessment.ts`
4. `app/api/risk-assessment/severity-summaries/route.ts`
5. `app/api/risk-assessment/historical/[category]/route.ts`
6. `app/api/risk-assessment/strategic-plan/route.ts`
7. `docs/responders info.md`

---

## Implementation Order

Execute the fixes in this exact order (dependencies flow downward):

1. **Fix 2** — Severity grid CSS (no logic dependency, fastest)
2. **Fix 3** — Severity bullet arrays (type → prompt → route → UI, self-contained)
3. **Fix 6** — Past Damages / Past Procedures prompt separation (prompt-only, no type changes)
4. **Fix 4** — Matched Event enrichment (prompt-only)
5. **Fix 7** — Per-category Strategic Recommendations (type + new method + route + UI — biggest change)
6. **Fix 5** — Current Procedures from Responder DB (requires reading model schemas)
7. **Fix 1** — Data consistency audit for Alerts & Communication page

---

## Fix 2 — Severity Levels: Dynamic Single-Row Column Layout

**Goal:** When N severity levels are active they must always render as N equal-width columns in a single row. Never wrap 2+1 or 3+1.

**File:** `app/(admin)/ai-risk-assessment/page.tsx`

**Locate:** The `SeverityLevelGrid` component. Find the `<div>` with class `"grid gap-4 md:grid-cols-2"`. It is inside the component's return, just before the `.map()` over `buckets`.

**Replace** that single `<div className="grid gap-4 md:grid-cols-2">` line with:

```tsx
<div className={
  buckets.length === 1 ? 'grid gap-4 grid-cols-1' :
  buckets.length === 2 ? 'grid gap-4 sm:grid-cols-2' :
  buckets.length === 3 ? 'grid gap-4 lg:grid-cols-3' :
  'grid gap-4 sm:grid-cols-2'   // 4 buckets = 2×2
}>
```

No other changes to this component for this fix.

---

## Fix 3 — Severity Levels: Bullet-Point Format with Full Property Data

**Goal:** Each severity-category summary must be a bullet list (not a paragraph), with every statistic, event name, date, time, and location explicitly represented. The AI prompt must pass `properties` field data.

### Step 3a — Type change in `lib/types/risk-assessment.ts`

Locate `SeverityCategoryItem`. Change the `summary: string` field to `bullets: string[]`:

```ts
export interface SeverityCategoryItem {
  category: string;
  eventCount: number;
  bullets: string[];   // replaces: summary: string
}
```

### Step 3b — OpenAI method change in `lib/services/openai-service.ts`

Locate `generateSeverityCategorySummary`. It currently returns `Promise<string>`. Make three changes:

**1. Change the return type to `Promise<string[]>`**

**2. Change the fallback** from a single string to an array:
```ts
const fallback = [
  `${input.events.length} active ${input.category} event(s) at ${input.severity} severity in ${[...new Set(input.events.map((e) => e.location))].slice(0, 3).join(', ')}.`
];
```

**3. Replace the entire `callOpenAI` call** with the following (new system prompt + new response shape):

```ts
const result = await this.callOpenAI<{ bullets: string[] }>(
  [
    {
      role: 'system',
      content: `${PLAIN_ENGLISH_STYLE_RULES}

You are summarizing all active ${input.category} events at ${input.severity} severity for an executive emergency briefing.

Return a JSON array of bullet strings — one bullet per event or major finding. Each bullet MUST:
- Be one complete, self-explanatory sentence.
- Include the event name, the affected location or county, the date and time (formatted as "May 22, 2026, 3:45 PM"), and ALL key statistics present in the data.
- Draw statistics directly from the "properties" field of each event: intensity value (1=Low, 2=Moderate, 3=High, 4=Extreme), affectedCounties array, effectiveAt, endsAt, injuriesDirect, deathsDirect, damageProperty, damageCrops, totalFederalAidUsd, femaDisasterNumber — whichever are non-null for this event.
- NEVER omit numbers, counts, dollar amounts, names, or timestamps that appear in the data.
- Wrap place names, severity words, and numeric facts in **double asterisks**.

Return JSON: {"bullets": ["<sentence>", ...]}.`,
    },
    {
      role: 'user',
      content: JSON.stringify(input.events.map((e) => this.projectEventForAI(e))),
    },
  ],
  { bullets: fallback },
  { max_tokens: 700 },
);
return Array.isArray(result.bullets) && result.bullets.length > 0 ? result.bullets : fallback;
```

### Step 3c — Route change in `app/api/risk-assessment/severity-summaries/route.ts`

**1. Update `BucketResult` type** (line ~65):
```ts
type BucketResult = { severity: string; category: string; eventCount: number; bullets: string[] };
```

**2. Update the task return** inside `tasks.push(async () => { ... })`:
```ts
const bullets = await openaiService.generateSeverityCategorySummary({
  severity: bucket.severity,
  category: catGroup.category,
  events: catGroup.events,
});
return {
  severity: bucket.severity,
  category: catGroup.category,
  eventCount: catGroup.events.length,
  bullets,
};
```

**3. Update the bucket assembly** where `bucketMap.get(item.severity)!.categories.push(...)`:
```ts
bucketMap.get(item.severity)!.categories.push({
  category: item.category,
  eventCount: item.eventCount,
  bullets: item.bullets,
});
```

### Step 3d — UI change in `app/(admin)/ai-risk-assessment/page.tsx`

Inside `SeverityLevelGrid`, find the `<div key={cat.category} ...>` that renders each category. Locate the paragraph:
```tsx
<p className="text-sm leading-relaxed text-slate-700">
  {renderEmphasis(cat.summary)}
</p>
```

Replace it with a bullet list:
```tsx
<ul className="space-y-1.5">
  {(cat.bullets ?? []).map((b, i) => (
    <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
      <span>{renderEmphasis(b)}</span>
    </li>
  ))}
</ul>
```

### Step 3e — Fix the PDF export in `app/(admin)/ai-risk-assessment/page.tsx`

In `buildPdf`, find the Severity Levels loop:
```ts
for (const bucket of severityBuckets) {
  for (const cat of bucket.categories) {
    writeBullets(`${bucket.severity} — ${humanizeCategory(cat.category)}`, [cat.summary]);
  }
}
```

Change `[cat.summary]` to `cat.bullets ?? []`:
```ts
writeBullets(`${bucket.severity} — ${humanizeCategory(cat.category)}`, cat.bullets ?? []);
```

---

## Fix 6 — Strict Separation of Past Damages vs Past Procedures

**Goal:** `past_damages` must contain ONLY physical destruction, casualties, and financial loss. `past_procedures` must contain ONLY response actions, aid, and operational strategies. No mixing.

**File:** `lib/services/openai-service.ts`

**Method:** `generateHistoricalPastSummary`

Locate the system prompt string inside the `callOpenAI` call. Replace the relevant instruction block — the part describing `past_damages` and `past_procedures` — with the following strictly separated rules:

```
- past_damages: string[] — ONLY bullets describing physical damage and losses. Include ONLY: infrastructure destroyed, acres burned, structures damaged or destroyed, direct casualties (exact deaths and injury counts), crop damage figures, property damage in dollars. Do NOT include any response actions, aid disbursements, or procedures in this array — those belong in past_procedures.

- past_procedures: string[] — ONLY bullets describing what responders and officials DID in response. Include ONLY: emergency declarations issued, federal aid amounts disbursed (with exact dollar amounts), evacuation orders, shelter activations, operational strategies, recovery programs activated, funding mechanisms used. Do NOT include damage statistics here — those belong in past_damages.
```

Keep the rest of the prompt (style rules, `matched_event`, `similarity_summary` keys, `**bold**` formatting instruction, `max_tokens: 900`) unchanged.

---

## Fix 4 — Historical: Matched Event Enrichment with Properties Data

**Goal:** The `matched_event` field must state the specific event name, its start date and time in friendly format, the location, and the key numeric stat from its `properties` (e.g. magnitude, intensity level, femaDisasterNumber, federal aid total, injuries, deaths, property damage).

**File:** `lib/services/openai-service.ts`

**Method:** `generateHistoricalPastSummary`

Two changes:

**1. Enrich the user content** to explicitly serialize the seed event's `properties` field so the model has access to every stat. Change the user message content from:

```ts
content: `CURRENT SEED EVENT:\n${JSON.stringify(this.projectEventForAI(input.currentSeed))}\n\nSIMILAR PAST EVENTS:\n${JSON.stringify(input.similarPastEvents.map((e) => this.projectEventForAI(e)))}`,
```

To (add a separate SEED_PROPERTIES block):
```ts
content: `CURRENT SEED EVENT:\n${JSON.stringify(this.projectEventForAI(input.currentSeed))}\n\nSEED_PROPERTIES (use these raw fields for matched_event statistics):\n${JSON.stringify(input.currentSeed.properties ?? {})}\n\nSIMILAR PAST EVENTS:\n${JSON.stringify(input.similarPastEvents.map((e) => this.projectEventForAI(e)))}`,
```

**2. Update the system prompt instruction for `matched_event`** to be explicit about the required format. Find the line:

```
- matched_event: short plain headline naming the type of past situation most like today's.
```

Replace it with:

```
- matched_event: A single sentence identifying the closest comparable past event type. It must state: the event name or type, the location, the friendly date and time (e.g. "June 12, 2023, 4:15 PM"), and the most impactful statistic from the SEED_PROPERTIES (e.g. intensity level, femaDisasterNumber, total federal aid, deaths, injuries, property damage, acres burned). Format example: "**[Event Name]** — **[Location]**, **[Date/Time]** — **[key stat]**". Wrap specific facts in **double asterisks**.
```

---

## Fix 7 — Per-Category Strategic Recommendations

**Goal:** Strategic Recommendations must be scoped per Historical Context category tab. When the user switches from Flood to Wildfire, the recommendations update. The single page-wide recommendations card is removed. Each historical tab's payload now contains its own `recommendations_list`.

This fix has four sub-steps: type change → new AI method → route change → UI restructure.

### Step 7a — Type change in `lib/types/risk-assessment.ts`

Add `recommendations_list` to `HistoricalTabPayload`:

```ts
export interface HistoricalTabPayload {
  category: string;
  historical_analysis: HistoricalAnalysis;
  hasSimilarPast: boolean;
  recommendations_list?: RecommendationItem[];   // ADD THIS
}
```

### Step 7b — New AI method in `lib/services/openai-service.ts`

Add a new method `generateCategoryStrategicPlan` to the `OpenAIService` class, placed after `generateStrategicPlan`:

```ts
async generateCategoryStrategicPlan(input: {
  category: string;
  futureMeasures: string[];
}): Promise<RecommendationItem[]> {
  const fallback: RecommendationItem[] = [
    { priority: 'URGENT', action: `Review and activate jurisdiction emergency protocols for ${input.category} incidents.`, deployable: true, step: 1 },
    { priority: 'IMMEDIATE', action: `Deploy emergency notifications for active ${input.category} events via Ready2Go alert system.`, deployable: true, step: 2 },
    { priority: 'STANDARD', action: `Conduct after-action review of ${input.category} incidents and update response procedures.`, deployable: false, step: 3 },
  ];

  if (!input.futureMeasures.length) return fallback;

  const result = await this.callOpenAI<{ recommendations_list: RecommendationItem[] }>(
    [
      {
        role: 'system',
        content: `${PLAIN_ENGLISH_STYLE_RULES}

You are the Emergency Operations Chief for an active **${input.category}** incident. Translate the proposed future mitigation measures below into a numbered, sequenced action plan specific to this hazard type.

Each item must be concrete — specify who owns it, when, and what outcome it produces. Assign exactly one of:
- IMMEDIATE: life-safety actions, do right now
- URGENT: within 24–72 hours
- STANDARD: within 1–4 weeks

Start each action with a bold verb. Focus ONLY on ${input.category} — do not reference other hazard categories.

Return JSON: {"recommendations_list": [{"priority": "IMMEDIATE"|"URGENT"|"STANDARD", "action": "<string>", "step": <number>, "deployable": <boolean>}, ...]}.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ category: input.category, futureMeasures: input.futureMeasures }),
      },
    ],
    { recommendations_list: fallback },
    { max_tokens: 700 },
  );

  const list = result.recommendations_list;
  if (!Array.isArray(list) || list.length === 0) return fallback;
  return list.map((r, i) => ({
    ...r,
    priority: normalizeRecommendationPriority(r.priority),
    step: r.step ?? i + 1,
    deployable: Boolean(r.deployable),
  }));
}
```

Note: `normalizeRecommendationPriority` is already a private function at the top of `openai-service.ts` — use it exactly as used in `generateStrategicPlan`.

### Step 7c — Route change in `app/api/risk-assessment/historical/[category]/route.ts`

After Call C (`futureResult`), add Call D for per-category recommendations:

```ts
// Call D: per-category strategic plan (depends on C's future_measures)
const categoryRecommendations = await openaiService.generateCategoryStrategicPlan({
  category,
  futureMeasures: futureResult.future_measures ?? [],
});
```

Then include it in the `payload` object:
```ts
const payload: HistoricalTabPayload = {
  category,
  hasSimilarPast,
  historical_analysis: {
    matched_event: hasSimilarPast ? pastResult.matched_event : undefined,
    similarity_summary: hasSimilarPast ? pastResult.similarity_summary : undefined,
    past_damages: hasSimilarPast ? pastResult.past_damages : undefined,
    past_procedures: hasSimilarPast ? pastResult.past_procedures : undefined,
    current_procedures: currentResult.current_procedures,
    future_measures: futureResult.future_measures,
    match_confidence,
  },
  recommendations_list: categoryRecommendations,   // ADD THIS
};
```

### Step 7d — UI changes in `app/(admin)/ai-risk-assessment/page.tsx`

This is the largest UI change. Do it in four parts:

**Part 1 — Remove the page-wide Strategic Recommendations card and its state.**

Locate and delete the entire `/* Strategic Recommendations */` card block (from the opening `<Card ...>` comment to its closing `</Card>`). This is the card with heading "Strategic Recommendations" and the `ol` list of recommendation items.

Also remove:
- The `loadingPlan` state: `const [loadingPlan, setLoadingPlan] = useState(false);`
- The `recommendations` state: `const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);`
- The `setRecommendations([])` call in `generate`
- The entire Stage 4 block inside `generate` (everything from `// Stage 4: strategic plan` through the `.finally(() => setLoadingPlan(false))` closing)
- Remove `loadingPlan` from the `canDownload` expression and from `isGenerating`
- Remove `RecommendationItem` from the imports if it becomes unused here (it may still be needed inside the per-tab UI below)

**Part 2 — Pass `tabDataMap` into `HistoricalAnalysisSection`.**

The component already receives `tabDataMap` as a prop. No prop signature change needed for this.

**Part 3 — Add per-tab recommendations rendering inside `HistoricalAnalysisSection`.**

In the `HistoricalAnalysisSection` component, inside the `{activeCategories.map((cat) => { ... })}` block, find where `HistoricalAnalysisBody` is rendered when `tabData` exists:

```tsx
) : (
  <HistoricalAnalysisBody
    data={tabData.historical_analysis}
    hasSimilarPast={tabData.hasSimilarPast}
  />
)}
```

Change it to render the analysis body plus a per-category recommendations block below it:

```tsx
) : (
  <>
    <HistoricalAnalysisBody
      data={tabData.historical_analysis}
      hasSimilarPast={tabData.hasSimilarPast}
    />
    {/* Per-category strategic recommendations */}
    {(tabData.recommendations_list?.length ?? 0) > 0 && (
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold tracking-tight text-slate-800">
              Strategic Recommendations — {humanizeCategory(cat)}
            </h4>
            <p className="text-[11px] text-slate-500">Prioritized action plan for this hazard category</p>
          </div>
        </div>
        <ol className="space-y-2.5">
          {tabData.recommendations_list!.map((rec, i) => {
            const meta = priorityMeta(rec.priority);
            const Icon = meta.icon;
            return (
              <li key={i} className={`flex flex-wrap items-start gap-3 rounded-xl border-l-4 bg-slate-50 p-3.5 ${meta.ring}`}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm border border-slate-100">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[10px] font-extrabold uppercase ${meta.pill}`}>{meta.label}</Badge>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Step {rec.step ?? i + 1}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{renderEmphasis(rec.action)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    )}
  </>
)}
```

Make sure `priorityMeta`, `humanizeCategory`, `renderEmphasis`, `Badge`, `ShieldAlert` are all already imported/defined — they are, based on reading the file.

**Part 4 — Update PDF export in `buildPdf`.**

Remove the final `writeBullets("Strategic Recommendations", ...)` call that uses the page-level `recommendations` array.

Instead, after the historical tab loop, add per-category recommendations:

```ts
for (const [cat, payload] of tabDataMap.entries()) {
  const h = payload.historical_analysis;
  // ... existing code for matched_event, past_damages, etc. ...
  if (h.future_measures?.length) writeBullets("Future Measures", h.future_measures);
  // ADD per-category recommendations:
  if (payload.recommendations_list?.length) {
    writeBullets(
      `Strategic Recommendations — ${humanizeCategory(cat)}`,
      payload.recommendations_list.map((r) => `[${r.priority}] Step ${r.step ?? 1}: ${stripEmphasis(r.action)}`),
    );
  }
  y += 6;
}
```

Also update the `buildPdf` function signature — remove the `recommendations: RecommendationItem[]` parameter since it is no longer needed:

```ts
function buildPdf(
  summary: RiskSummaryPayload,
  severityBuckets: SeverityBucket[],
  tabDataMap: Map<string, HistoricalTabPayload>,
) {
```

And update the `downloadPdf` call in the main page component:
```ts
buildPdf(summary, severityBuckets, tabDataMap);
```

**Part 5 — Update `canDownload`.**

Since `loadingPlan` is removed:
```ts
const canDownload = summary !== null && !loadingSeverity && loadingCategories.size === 0;
```

**Part 6 — Mark `strategic-plan` route as legacy.**

In `app/api/risk-assessment/strategic-plan/route.ts`, add a comment at the top of the file (after imports):
```ts
// LEGACY: Per-category recommendations are now generated inside /historical/[category].
// This route is kept for backwards compatibility but is no longer called by the UI.
```

---

## Fix 5 — Current Procedures Sourced from Responder DB

**Goal:** The `current_procedures` section must describe what active responders are currently doing — sourced from the Responder DB models — not just generic inferences from event data.

### Step 5a — Create `lib/services/risk-responder-data.ts`

Create this new file. It exports one function `getActiveRespondersForCategory`.

The function:
1. Accepts `(category: string, stateCd?: string)` — if `stateCd` is defined, filter by jurisdiction; otherwise nationwide.
2. Queries the relevant Mongoose models (imported from `models/`) based on a category-to-responder-type mapping.
3. Returns a lean JSON summary of active/deployed responder records for AI consumption.

**Category → Responder model mapping:**

| Category key(s) | Responder models to query |
|---|---|
| `flood`, `coastal_surf`, `tsunami` | `ResponderHospitalCapacity`, `ResponderPoliceDeployment`, `ResponderNationalGuardDeployment`, `ResponderFoodLogisticsDeployment` |
| `wildfire` | `ResponderPoliceDeployment`, `ResponderNationalGuardDeployment`, `ResponderFoodLogisticsDeployment`, `ResponderWaterDeployment` |
| `earthquake`, `tsunami`, `volcanic` | `ResponderHospitalCapacity`, `ResponderPoliceDeployment`, `ResponderNationalGuardDeployment`, `ResponderFederalDeployment` |
| `storm`, `hurricane_typhoon`, `winter_weather` | `ResponderHospitalCapacity`, `ResponderPoliceDeployment`, `ResponderNationalGuardDeployment`, `ResponderEnergyDeployment`, `ResponderElectricDeployment` |
| `hazardous` | `ResponderHospitalCapacity`, `ResponderPoliceDeployment`, `ResponderPharmacyDeployment` |
| `fema_declaration` | `ResponderFederalDeployment`, `ResponderNonprofitDeployment`, `ResponderFoodLogisticsDeployment` |
| ALL categories (always include) | `ResponderHospitalCapacity`, `ResponderPoliceDeployment` |

**What to project from each model** (only the fields useful for AI summary):

- `ResponderHospitalCapacity`: `facilityName`, `units` (array of `{ name, capacity, occupied, unitType }`), `notes`
- `ResponderPoliceDeployment`: `agencyName`, `vehiclesDeployed`, `personnelOnDuty`, `incidentOperations` (array of `{ incidentName, teamsDeployed, operationSummary }`), `stagingAreas` (array of `{ name, address, units }`)
- Other models: query with `.lean()` and project `{ _id: 0 }` — return all non-id fields but cap arrays to 5 items.

**Return type:** `Record<string, unknown[]>` — keyed by model name (e.g. `{ "hospitals": [...], "police": [...] }`). Return empty object if no records found.

**Full file skeleton:**

```ts
import dbConnect from '@/lib/mongodb';
import ResponderHospitalCapacity from '@/models/ResponderHospitalCapacity';
import ResponderPoliceDeployment from '@/models/ResponderPoliceDeployment';
import ResponderNationalGuardDeployment from '@/models/ResponderNationalGuardDeployment';
import ResponderFoodLogisticsDeployment from '@/models/ResponderFoodLogisticsDeployment';
import ResponderWaterDeployment from '@/models/ResponderWaterDeployment';
import ResponderFederalDeployment from '@/models/ResponderFederalDeployment';
import ResponderEnergyDeployment from '@/models/ResponderEnergyDeployment';
import ResponderElectricDeployment from '@/models/ResponderElectricDeployment';
import ResponderPharmacyDeployment from '@/models/ResponderPharmacyDeployment';
import ResponderNonprofitDeployment from '@/models/ResponderNonprofitDeployment';

/** Returns a keyed snapshot of active responder records relevant to the given category. */
export async function getActiveRespondersForCategory(
  category: string,
  stateCd?: string,
): Promise<Record<string, unknown[]>> {
  // dbConnect should already be called by the route handler, but call it defensively.
  await dbConnect();

  // Build the set of model queries relevant to this category.
  const queries: Array<{ key: string; promise: Promise<unknown[]> }> = [];

  // Hospital and Police are always included regardless of category.
  queries.push(
    { key: 'hospitals', promise: ResponderHospitalCapacity.find({}).lean().then(docs => docs.slice(0, 10).map(projectHospital)) },
    { key: 'police', promise: ResponderPoliceDeployment.find({}).lean().then(docs => docs.slice(0, 10).map(projectPolice)) },
  );

  if (['flood', 'coastal_surf', 'tsunami', 'wildfire', 'storm', 'hurricane_typhoon', 'winter_weather', 'earthquake', 'volcanic'].includes(category)) {
    queries.push({ key: 'national_guard', promise: ResponderNationalGuardDeployment.find({}).lean().then(docs => docs.slice(0, 5)) });
  }
  if (['flood', 'coastal_surf', 'tsunami', 'wildfire', 'fema_declaration'].includes(category)) {
    queries.push({ key: 'food_logistics', promise: ResponderFoodLogisticsDeployment.find({}).lean().then(docs => docs.slice(0, 5)) });
  }
  if (['wildfire', 'flood'].includes(category)) {
    queries.push({ key: 'water', promise: ResponderWaterDeployment.find({}).lean().then(docs => docs.slice(0, 5)) });
  }
  if (['earthquake', 'tsunami', 'volcanic', 'fema_declaration'].includes(category)) {
    queries.push({ key: 'federal', promise: ResponderFederalDeployment.find({}).lean().then(docs => docs.slice(0, 5)) });
  }
  if (['storm', 'hurricane_typhoon', 'winter_weather'].includes(category)) {
    queries.push(
      { key: 'energy', promise: ResponderEnergyDeployment.find({}).lean().then(docs => docs.slice(0, 5)) },
      { key: 'electric', promise: ResponderElectricDeployment.find({}).lean().then(docs => docs.slice(0, 5)) },
    );
  }
  if (category === 'hazardous') {
    queries.push({ key: 'pharmacy', promise: ResponderPharmacyDeployment.find({}).lean().then(docs => docs.slice(0, 5)) });
  }
  if (['fema_declaration'].includes(category)) {
    queries.push({ key: 'nonprofit', promise: ResponderNonprofitDeployment.find({}).lean().then(docs => docs.slice(0, 5)) });
  }

  // Run all queries in parallel and collect non-empty results.
  const settled = await Promise.allSettled(queries.map(q => q.promise));
  const result: Record<string, unknown[]> = {};
  queries.forEach((q, i) => {
    const s = settled[i];
    if (s.status === 'fulfilled' && Array.isArray(s.value) && s.value.length > 0) {
      result[q.key] = s.value;
    }
  });
  return result;
}

function projectHospital(doc: any) {
  return {
    facilityName: doc.facilityName,
    notes: doc.notes,
    units: (doc.units ?? []).slice(0, 5).map((u: any) => ({
      name: u.name,
      capacity: u.capacity,
      occupied: u.occupied,
      unitType: u.unitType,
    })),
  };
}

function projectPolice(doc: any) {
  return {
    agencyName: doc.agencyName,
    vehiclesDeployed: doc.vehiclesDeployed,
    personnelOnDuty: doc.personnelOnDuty,
    incidentOperations: (doc.incidentOperations ?? []).slice(0, 3),
    stagingAreas: (doc.stagingAreas ?? []).slice(0, 3),
  };
}
```

### Step 5b — Update `generateHistoricalCurrentSummary` in `lib/services/openai-service.ts`

Add `activeResponders` as an optional second input parameter:

```ts
async generateHistoricalCurrentSummary(input: {
  category: string;
  currentEvents: UnifiedEventDoc[];
  activeResponders?: Record<string, unknown[]>;
}): Promise<{ current_procedures?: string[] }>
```

Update the system prompt to describe both live events and responder status:

```ts
content: `${PLAIN_ENGLISH_STYLE_RULES}

You are writing the "Current Procedures" section describing both the live ${input.category} incidents AND what active responders are currently doing.

From the CURRENT EVENTS, describe: what is happening, where, who is affected, when, and key measurements.
From the ACTIVE RESPONDERS, describe: which responders are deployed, where, their current capacity and staffing levels, and how they are actively responding.

Be specific — name facilities, agencies, and units. Include capacity numbers, personnel counts, and deployment locations. Wrap key facts in **double asterisks**. Include ALL event names, locations, and statistics present in the data.

Return JSON: {"current_procedures": ["<sentence>", ...]}.`,
```

Update the user message to pass both:

```ts
{
  role: 'user',
  content: JSON.stringify({
    currentEvents: input.currentEvents.map((e) => this.projectEventForAI(e)),
    activeResponders: input.activeResponders ?? {},
  }),
},
```

Keep `max_tokens: 700`.

### Step 5c — Update the historical route `app/api/risk-assessment/historical/[category]/route.ts`

**Add the import** at the top:
```ts
import { getActiveRespondersForCategory } from '@/lib/services/risk-responder-data';
```

**After loading `currentEvents`**, fetch responder data in parallel with the existing `findSimilarPastEvents` call. Update the parallel section to three parallel calls:

```ts
// Fetch similar past events, seed event selection, and responder data in parallel
const seedEvent = pickSeedEvent(currentEvents);

const [similarPast, activeResponders] = await Promise.all([
  findSimilarPastEvents(seedEvent, 3),
  getActiveRespondersForCategory(category, scope.nationwide ? undefined : scope.stateCd),
]);
```

**Pass `activeResponders` to `generateHistoricalCurrentSummary`:**

```ts
const [pastResult, currentResult] = await Promise.all([
  openaiService.generateHistoricalPastSummary({ category, similarPastEvents: similarPast, currentSeed: seedEvent }),
  openaiService.generateHistoricalCurrentSummary({ category, currentEvents, activeResponders }),
]);
```

---

## Fix 1 — Data Consistency Between Alerts & Communication and AI Risk Assessment

**Goal:** Both pages must show the same active incident count. All active events must flow through `UnifiedEvent` with `dataStatus: 'current'` using the same jurisdiction scoping.

### Step 1a — Locate the Alerts & Communication page

Search for the page at `app/(admin)/alerts-communication/page.tsx` (or a similar path — it may also be at `app/(admin)/alert-communication/page.tsx`). Read the file.

### Step 1b — Locate what API route it calls for alert counts

Search for any `fetch(...)` calls or data-fetching hooks in the page. Identify which API route provides the active alerts count. Check if that route reads from `UnifiedEvent` with `dataStatus: 'current'` scoped by role.

If it uses a different model (e.g., a legacy `Alert` model or a separate collection), update it:

- Import `getCurrentEvents` from `@/lib/services/unified-event-repo`
- Import `resolveRiskIngestScopeForSession` from `@/lib/risk-assessment/resolve-ingest-scope`
- Call `getCurrentEvents({ stateCd: scope.nationwide ? undefined : scope.stateCd })` and return the count

### Step 1c — Add "Total Active Alerts" counter to the Alerts & Communication page UI

Find the page component. Add a visible KPI-style counter near the top of the page (after the page header, before the alert list) showing the total count of active events from `UnifiedEvent`:

```tsx
{/* Total Active Alerts counter */}
<Card className="rounded-2xl bg-white p-5 shadow-xl shadow-slate-200/50 border-slate-100">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Total Active Alerts</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-slate-800">{totalAlerts}</p>
      <p className="mt-1 text-xs text-slate-400">Same dataset as AI Risk Assessment · UnifiedEvent current</p>
    </div>
    <Activity className="h-6 w-6 text-slate-300" />
  </div>
</Card>
```

Where `totalAlerts` comes from the same `UnifiedEvent` query used by `/api/risk-assessment/summary`.

### Step 1d — Verify scoping is identical

In both:
- `/api/risk-assessment/summary/route.ts`
- The Alerts & Communication API route

Confirm that both use `resolveRiskIngestScopeForSession(role, userId, body)` and then pass `{ stateCd: scope.nationwide ? undefined : scope.stateCd }` to `getCurrentEvents`. If one uses a different scoping path, align it to use `resolveRiskIngestScopeForSession`.

---

## TypeScript Compilation Check

After implementing all fixes, run the TypeScript compiler to verify there are no type errors:

```bash
npx tsc --noEmit
```

Key type checks to verify manually:

1. `SeverityCategoryItem.bullets: string[]` is used everywhere `cat.summary` was previously used — check `severity-summaries/route.ts` and `page.tsx` for any remaining `.summary` references on a `SeverityCategoryItem`.
2. `HistoricalTabPayload.recommendations_list?: RecommendationItem[]` — check that the route file and page both import `RecommendationItem` from `@/lib/types/risk-assessment`.
3. `buildPdf` signature no longer takes `recommendations: RecommendationItem[]` — verify the call site in `downloadPdf` no longer passes it.
4. `loadingPlan` state is fully removed — verify no remaining references.

---

## Files Changed Summary

| File | Change Type |
|---|---|
| `lib/types/risk-assessment.ts` | `SeverityCategoryItem.summary → bullets: string[]`; `HistoricalTabPayload` + `recommendations_list` |
| `lib/services/openai-service.ts` | `generateSeverityCategorySummary` returns `string[]`; `generateHistoricalPastSummary` strict prompts + seed properties; `generateHistoricalCurrentSummary` + responder input; new `generateCategoryStrategicPlan` |
| `lib/services/risk-responder-data.ts` | **New file** — `getActiveRespondersForCategory` |
| `app/api/risk-assessment/severity-summaries/route.ts` | `BucketResult.bullets: string[]`; push `bullets` instead of `summary` |
| `app/api/risk-assessment/historical/[category]/route.ts` | Fetch `activeResponders`; pass to `generateHistoricalCurrentSummary`; add Call D for `generateCategoryStrategicPlan`; include `recommendations_list` in payload |
| `app/api/risk-assessment/strategic-plan/route.ts` | Add legacy comment — do not delete |
| `app/(admin)/ai-risk-assessment/page.tsx` | Severity grid dynamic columns; `cat.bullets` bullet list rendering; remove page-wide recommendations card + state; add per-tab recommendations inside `HistoricalAnalysisSection`; update `buildPdf` signature; update `canDownload` |
| `app/(admin)/alerts-communication/page.tsx` | Add Total Active Alerts counter; verify scoping uses `resolveRiskIngestScopeForSession` + `UnifiedEvent` |
