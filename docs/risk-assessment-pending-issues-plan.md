# AI Risk Assessment — Pending Issues Implementation Plan

## Context

The AI Risk Assessment page is functionally complete but has 5 outstanding quality issues documented in `docs/risk-assessment-pending-issues.md`. This plan produces ONE deliverable: a self-contained markdown file at `docs/risk-assessment-pending-issues-plan.md` that Claude Sonnet can execute end-to-end (same format as the existing `docs/fixes-implementation-plan.md`).

### The 5 issues, anchored to current code

| # | Issue | Root cause |
|---|---|---|
| 1a | Same event repeats (Super Typhoon Sinlaku × 5) | FEMA stores 1 doc per designated county; NWS stores 1 per zone; no display-level grouping in repo or UI |
| 1b | "about 5 hours ago" instead of real date | `issuedAt` is a free-text STRING set by ingest; real ISO time lives in `properties[category].effectiveAt` / `onsetAt` / `incidentBeginDate` / `beginDateTime` |
| 2 | Top counter (303) vs cards visually disconnected | Raw counts go to KPI; AI compresses 148 Marine events into 1 bullet. Per-group context is missing → user can't see "1 declaration covers 5 counties" |
| 3 | No county/state/coords on screen | `/summary` strips raw arrays at line 46. `SeverityCategoryItem` only has `{category, eventCount, bullets}` |
| 4 | No NWS/FEMA/USGS badge | `source` field also stripped before reaching client |
| 5 | "High" / "Moderate" columns scale out of proportion; 22 Hazardous events become one giant semicolon bullet | Severity cards have no `max-height`; AI input not bounded; AI output not capped at N bullets |

### User-confirmed design choices (these supersede the previous draft)

- **Counts stay raw.** KPI keeps showing 303. We add a "covers N counties" / "duplicate-of-N" badge **per group** rather than changing the headline number.
- **AI receives all events.** No top-N sampling. Bump `max_tokens` (700 → 2000) and let OpenAI summarize the full set. Prompt instructs "no more than 5 bullets per category" so the output is bounded even when input is large.
- **Skip Alerts & Communication.** Out of scope for this plan; only `/ai-risk-assessment` is touched.
- **Full code skeletons.** Match the style of `docs/fixes-implementation-plan.md` — exact TypeScript snippets with file:line refs.

---

## Output Document Structure

The file `docs/risk-assessment-pending-issues-plan.md` will contain these sections, in order:

### 0. Prerequisites
- "Read these files first" list (same pattern as the previous plan).
- Brief recap of the data flow: `UnifiedEvent (Mongo) → unified-event-repo → risk-current-snapshot → /summary + /severity-summaries → page.tsx`.

### 1. Implementation Order
1. **Fix A** — Real Timestamps from `properties` (foundation; everything else uses the helper)
2. **Fix B** — Event Grouping / Duplicate Badges
3. **Fix C** — Geographic + Source Metadata Pass-Through (Issues #3 + #4 merged — same touch points)
4. **Fix D** — UI Scaling, Collapsibility, AI Bound

### 2. Fix A — Real Timestamps from `properties`

**Goal:** Replace `"about 5 hours ago"` strings with friendly absolute dates derived from `properties[category]` ISO fields.

**Files:**
- New: `lib/services/event-formatters.ts` — exports `extractEventTimestamp(event)` and `formatEventTimestamp(event)`
- Edit: `lib/services/openai-service.ts` — `projectEventForAI` now includes `formattedTimestamp`

**Logic:**
```ts
export function extractEventTimestamp(e: UnifiedEventDoc): Date | null {
  const p = (e.properties ?? {})[e.category] as Record<string, unknown> | undefined;
  if (!p) return null;

  // Priority order — earliest "real" timestamp on the event
  const candidates = [
    p.effectiveAt, p.onsetAt, p.incidentBeginDate,
    p.beginDateTime, p.declarationDate,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length) {
      const d = new Date(c);
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Fall back to Mongo's updatedAt
  return e.updatedAt ? new Date(e.updatedAt) : null;
}

export function formatEventTimestamp(e: UnifiedEventDoc): string {
  const d = extractEventTimestamp(e);
  if (!d) return 'Timestamp unavailable';
  return d.toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
  // Example output: "May 22, 2026, 4:11 AM"
}
```

**Plan section will include:** full `extractEventTimestamp` + `formatEventTimestamp` code; updated `projectEventForAI` snippet; instruction to replace bullet-level rendering of `issuedAt` strings with the new formatted output.

### 3. Fix B — Event Grouping & Duplicate Badges

**Goal:** When FEMA designates 5 counties under DR-4910-MP, show ONE row "Super Typhoon Sinlaku — covers 5 counties (Northern Islands, Saipan, …)" instead of 5 separate rows. The headline KPI **still counts all 5** — the badge surfaces the grouping.

**Files:**
- New: `lib/services/event-grouping.ts` — exports `groupRelatedEvents(events)` and `EventGroup` type
- Edit: `app/api/risk-assessment/severity-summaries/route.ts` — apply grouping before passing to OpenAI
- Edit: `lib/types/risk-assessment.ts` — extend `SeverityCategoryItem` with `groups: EventGroupSummary[]`

**Canonical key per source:**
```ts
function canonicalKey(e: UnifiedEventDoc): string {
  const p = (e.properties ?? {})[e.category] as any;
  switch (e.source) {
    case 'fema':
      return `fema:${p?.femaDeclarationString ?? e.name}`;          // e.g. "DR-4910-MP"
    case 'nws':
      return `nws:${e.name}|${p?.effectiveAt ?? ''}`;                // same alert text + same start
    case 'noaa_ncei':
      return `ncei:${p?.nceiEventId ?? e.externalId}`;
    case 'earthquake':
    case 'usgs':
      return `usgs:${e.externalId}`;
    default:
      return `${e.source}:${e.name}|${e.category}|${extractState(e.location)}`;
  }
}
```

**EventGroup shape (server-side):**
```ts
export interface EventGroup {
  canonicalKey: string;
  primary: UnifiedEventDoc;          // most-severe / earliest member
  members: UnifiedEventDoc[];        // includes primary
  affectedCounties: string[];        // union from properties[category].affectedCounties OR designatedArea
  affectedStates: string[];          // unique 2-letter codes parsed from location
  sources: Set<string>;              // usually 1, but >1 possible if same event ingested from multiple feeds
  duplicateCount: number;            // members.length
}
```

**Wire-up in `/severity-summaries`:**
- After `computeRiskSnapshot`, for each `(severity, category)` bucket:
  - Call `groupRelatedEvents(catGroup.events)` → returns `EventGroup[]`.
  - Pass the **primary event of each group** (plus the `affectedCounties` aggregate) to OpenAI as a single richer event. This naturally cuts duplicate noise without changing counts.
  - Include `groups` in the response payload so the UI can render the duplicate badges.

**KPI behavior:** unchanged — `alerts_count` still equals raw event count. The badge **"covers N counties"** or **"+ N duplicate alerts"** appears per bullet in the severity card.

### 4. Fix C — Geographic + Source Metadata Pass-Through

**Goal:** Surface `county`, `state`, `affectedCounties[]`, `lat`, `lng`, `source` on every severity bullet so the user sees concrete geography and authoritative source.

**Files:**
- Edit: `lib/types/risk-assessment.ts` — add `EventGroupSummary` and `SOURCE_LABEL_MAP`
- Edit: `app/api/risk-assessment/severity-summaries/route.ts` — project metadata into response
- Edit: `app/(admin)/ai-risk-assessment/page.tsx` — render chip strip per bullet

**Type additions:**
```ts
export type UnifiedEventSource =
  | 'nws' | 'fema' | 'usgs' | 'earthquake' | 'noaa_ncei'
  | 'noaa_nwis' | 'nwps' | 'nasa_firms' | 'inciweb' | 'manual' | 'seed';

export const SOURCE_LABEL_MAP: Record<UnifiedEventSource, { label: string; tone: string }> = {
  nws:         { label: 'NWS',          tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  fema:        { label: 'FEMA',         tone: 'bg-red-50 text-red-700 border-red-200' },
  usgs:        { label: 'USGS',         tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  earthquake:  { label: 'USGS Quakes',  tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  noaa_ncei:   { label: 'NOAA NCEI',    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  noaa_nwis:   { label: 'NOAA NWIS',    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  nwps:        { label: 'NOAA NWPS',    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  nasa_firms:  { label: 'NASA FIRMS',   tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  inciweb:     { label: 'InciWeb',      tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  manual:      { label: 'Manual',       tone: 'bg-slate-50 text-slate-700 border-slate-200' },
  seed:        { label: 'Seed',         tone: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export interface EventGroupSummary {
  name: string;
  source: UnifiedEventSource;
  severity: 'Low'|'Moderate'|'High'|'Extreme';
  primaryLocation: string;     // e.g. "Imperial Valley"
  state?: string;              // 2-letter, parsed from location
  affectedCounties: string[];  // de-duped list
  duplicateCount: number;
  lat?: number;
  lng?: number;
  hasCoordinates: boolean;
  formattedTimestamp: string;
}

export interface SeverityCategoryItem {
  category: string;
  eventCount: number;            // unchanged — raw count
  groupCount: number;            // NEW — distinct events after grouping
  bullets: string[];             // unchanged — AI text
  groups: EventGroupSummary[];   // NEW — one entry per group, drives chips & toggles
}
```

**`/severity-summaries` projection:**
- For each `(severity, category)` bucket:
  - `groups = groupRelatedEvents(catGroup.events).map(toEventGroupSummary)`
  - Include `groups`, `groupCount: groups.length`, `eventCount: catGroup.events.length` in response.
- `bullets` AI text is unchanged at the API layer; the UI layer pairs bullets to groups visually (first N bullets ↔ first N groups by index).

**UI rendering:**
- New component `EventChipStrip` inside `page.tsx` renders a row of pills under each bullet:
  ```tsx
  function EventChipStrip({ group }: { group: EventGroupSummary }) {
    const src = SOURCE_LABEL_MAP[group.source];
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <span className={`rounded px-1.5 py-0.5 border ${src.tone}`}>{src.label}</span>
        {group.state && (
          <span className="rounded px-1.5 py-0.5 border bg-slate-50 text-slate-700 border-slate-200">{group.state}</span>
        )}
        {group.affectedCounties.length === 1 ? (
          <span className="text-slate-500">{group.affectedCounties[0]}</span>
        ) : group.affectedCounties.length > 1 ? (
          <span className="rounded px-1.5 py-0.5 border bg-emerald-50 text-emerald-700 border-emerald-200">
            covers {group.affectedCounties.length} counties
          </span>
        ) : null}
        {group.hasCoordinates && (
          <span className="text-slate-400" title={`${group.lat?.toFixed(2)}, ${group.lng?.toFixed(2)}`}>
            <MapPin className="inline h-3 w-3" />
          </span>
        )}
        {group.duplicateCount > 1 && (
          <span className="text-slate-400">+ {group.duplicateCount - 1} duplicate alert(s)</span>
        )}
        <span className="text-slate-400">· {group.formattedTimestamp}</span>
      </div>
    );
  }
  ```

### 5. Fix D — UI Scaling, Collapse, AI Bound

**Goal:** Severity cards must not grow unboundedly. When a category has many events (Marine 148, Hazardous 22), the AI must produce multiple meaningful bullets, not one semicolon-joined blob.

**Files:**
- Edit: `lib/services/openai-service.ts` — `generateSeverityCategorySummary`: bump `max_tokens` 700 → 2000; tighten the prompt to cap output bullets
- Edit: `app/(admin)/ai-risk-assessment/page.tsx` — `SeverityLevelGrid` + category sub-block: max-h + scroll + collapse-by-default for long buckets

**Prompt updates (snippet — the plan file will include the full replacement):**
```
Return AT MOST 5 bullets per (severity, category). If the input has many events:
  - Cluster by affected state/county and produce one bullet per cluster.
  - End with a single trailing bullet "**N more event(s)** across **<states>**" if any remain.
Each bullet must include: the event name, the affected county/state, the friendly date+time, and the key statistic.
Do NOT produce a single semicolon-joined mega-bullet.
```

**Token bump:**
```ts
{ max_tokens: 2000 }   // was 700
```

**UI scaling — `SeverityLevelGrid` category sub-block:**
- Wrap the `<ul>` of bullets in `<div className="max-h-[480px] overflow-y-auto pr-1">` so each category sub-block scrolls internally rather than expanding the card.
- If `cat.bullets.length > 3`, show first 3 + toggle "Show all N bullets" (component-local `useState`).
- Each `<li>` now contains: bullet text + `<EventChipStrip group={cat.groups[i]} />` underneath.
- Category sub-block header shows: `<category> · <eventCount> active · <groupCount> distinct events`.

**Severity card container:** no fixed height needed once sub-blocks scroll; existing grid layout from Fix 2 (1/2/3 columns based on bucket count) remains.

### 6. Verification Checklist (will be included in the output file)

- [ ] Hurricane Typhoon's "Super Typhoon Sinlaku" appears as ONE entry with badge "covers 5 counties (Northern Islands, Saipan, Tinian, Rota, Northern Mariana Islands)".
- [ ] Each severity bullet has `[NWS] [TX] Cooper County · May 22, 2026, 7:30 PM` style chip strip.
- [ ] Bullet text shows real dates ("May 22, 2026, 7:30 PM"), never "about 5 hours ago".
- [ ] Moderate Hazardous bucket shows ≤5 bullets, with a "Show all" toggle for the rest.
- [ ] Severity cards never exceed ~600px tall; long lists scroll inside.
- [ ] `alerts_count` KPI is unchanged from current behavior (raw).
- [ ] `bullets[i]` and `groups[i]` are index-aligned (1:1) per category sub-block.
- [ ] `npx tsc --noEmit` passes.
- [ ] PDF export still works (`buildPdf` updated to use formatted timestamps and source labels).

### 7. Files Changed Summary

| File | Change |
|---|---|
| `lib/services/event-formatters.ts` | **New** — `extractEventTimestamp`, `formatEventTimestamp` |
| `lib/services/event-grouping.ts` | **New** — `groupRelatedEvents`, `EventGroup`, `canonicalKey`, `toEventGroupSummary` |
| `lib/types/risk-assessment.ts` | Add `EventGroupSummary`, `UnifiedEventSource`, `SOURCE_LABEL_MAP`; extend `SeverityCategoryItem` with `groups`, `groupCount` |
| `lib/services/openai-service.ts` | `projectEventForAI` adds `formattedTimestamp`; `generateSeverityCategorySummary` bumps `max_tokens` to 2000 + new bullet-cap rules in prompt |
| `app/api/risk-assessment/severity-summaries/route.ts` | Apply `groupRelatedEvents` per bucket; include `groups` + `groupCount` in response |
| `app/(admin)/ai-risk-assessment/page.tsx` | `EventChipStrip` component; per-category max-h + scroll + collapse; sub-block header with `groupCount`; PDF export uses chip metadata |

### 8. Out of Scope

- Alerts & Communication page (per user's explicit choice).
- Top-N AI input sampling (per user's choice — pass all events with bumped tokens).
- Changing the headline `alerts_count` formula (per user's choice — counts stay raw).

---

## Verification of THIS Plan (before exiting plan mode)

The plan above:
- Reuses existing `unified-event-repo.ts`, `risk-current-snapshot.ts`, `openai-service.ts`, page UI — no architectural rewrites.
- Adds two small new service files for clean separation (`event-formatters`, `event-grouping`).
- Touches one type file, one route file, one UI file — same blast radius as the previous fix plan.
- Each issue from `risk-assessment-pending-issues.md` is mapped to a concrete code change:
  - #1a duplicates → Fix B (grouping + badges)
  - #1b timestamps → Fix A (formatters)
  - #2 count mismatch → Fix B's badges surface the per-group context; raw KPI stays
  - #3 geographic → Fix C (chip strip)
  - #4 source → Fix C (`SourceBadge` via `SOURCE_LABEL_MAP`)
  - #5 UI scaling → Fix D (max-h + collapse + AI bullet cap + token bump)
