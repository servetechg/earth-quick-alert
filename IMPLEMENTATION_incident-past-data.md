# Implementation Spec — Incident Details: Past Damages/Losses & Past Procedures

> **For the implementing agent (Claude Sonnet).** This is a complete, code-level spec. Follow it top to bottom. No new MongoDB models or migrations are required — all matching/AI logic already exists and is reused.

---

## Goal

In the **Incident Details** modal (opened via the "Learn more" links on the AI Risk Assessment dashboard):

1. **Remove** the disclaimer note `"… record(s) · AI-assisted summary, verify before acting."`.
2. **Add incident-specific historical data**: for the incident being viewed, look up *similar past incidents* in the database and show their real **Past Damages / Losses** and **Past Procedures**, preceded by a short lead-in naming the closest matching past incident and why today resembles it.

Keep the existing AI "Historical Context" paragraph — it is category/narrative-level. The new sections are incident-specific and DB-backed. Both coexist.

---

## Files to change

1. `app/api/risk-assessment/incident-details/route.ts` (backend)
2. `app/(admin)/ai-risk-assessment/page.tsx` (frontend)

No other files change. The matching + AI functions already exist (do **not** rewrite them):
- `pickSeedEvent`, `findSimilarPastEvents`, `computeMatchConfidence` → `lib/services/risk-similar-events.ts`
- `openaiService.generateHistoricalPastSummary(...)` → `lib/services/openai-service.ts` (line ~1436)
- `normalizeUnifiedEventCategory` → `lib/unified-event/category-infer.ts`

This exact chain is already used by `app/api/risk-assessment/historical/[category]/route.ts` — use it as a reference for call shapes.

---

## STEP 1 — Backend: `app/api/risk-assessment/incident-details/route.ts`

### 1a. Add imports

After the existing imports, add:

```ts
import { pickSeedEvent, findSimilarPastEvents, computeMatchConfidence } from '@/lib/services/risk-similar-events';
import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';
```

### 1b. Add the `IncidentPastContext` type and extend the response interface

Replace the existing `IncidentDetailResponse` interface block:

```ts
export interface IncidentDetailResponse {
    groups: EventGroupSummary[];
    narrative?: IncidentDetailNarrative;
    eventCount: number;
}
```

with:

```ts
export interface IncidentPastContext {
    matchedEvent?: string;
    similaritySummary?: string;
    pastDamages?: string[];
    pastProcedures?: string[];
    matchConfidence?: number;
}

export interface IncidentDetailResponse {
    groups: EventGroupSummary[];
    narrative?: IncidentDetailNarrative;
    pastContext?: IncidentPastContext;
    eventCount: number;
}
```

### 1c. Generate past context in parallel with the narrative

Current code (around lines 56–65):

```ts
        const groups = groupRelatedEvents(events);
        const narrative = groupsOnly
            ? undefined
            : await openaiService.generateIncidentDetailNarrative({ events });

        const response: IncidentDetailResponse = {
            groups: groups.map(toEventGroupSummary),
            ...(narrative ? { narrative } : {}),
            eventCount: events.length,
        };
```

Replace with:

```ts
        const groups = groupRelatedEvents(events);

        // Helper: find similar past incidents for THIS group and summarize their
        // real damages/procedures. Returns undefined when no comparable past
        // records exist, so the UI can omit the section entirely.
        async function buildPastContext(): Promise<IncidentPastContext | undefined> {
            const seed = pickSeedEvent(events);
            const similarPast = await findSimilarPastEvents(seed, 3);
            if (similarPast.length === 0) return undefined;

            const summary = await openaiService.generateHistoricalPastSummary({
                category: normalizeUnifiedEventCategory(seed.category),
                similarPastEvents: similarPast,
                currentSeed: seed,
            });

            const ctx: IncidentPastContext = {
                matchedEvent: summary.matched_event,
                similaritySummary: summary.similarity_summary,
                pastDamages: summary.past_damages,
                pastProcedures: summary.past_procedures,
                matchConfidence: computeMatchConfidence(seed, similarPast),
            };

            // Omit entirely if the AI produced no usable content.
            const hasContent =
                (ctx.pastDamages?.length ?? 0) > 0 ||
                (ctx.pastProcedures?.length ?? 0) > 0 ||
                !!ctx.matchedEvent;
            return hasContent ? ctx : undefined;
        }

        const [narrative, pastContext] = groupsOnly
            ? [undefined, undefined]
            : await Promise.all([
                openaiService.generateIncidentDetailNarrative({ events }),
                buildPastContext(),
            ]);

        const response: IncidentDetailResponse = {
            groups: groups.map(toEventGroupSummary),
            ...(narrative ? { narrative } : {}),
            ...(pastContext ? { pastContext } : {}),
            eventCount: events.length,
        };
```

**Notes**
- Only the detail fetch (`groupsOnly === false`) does the lookup. The `groupsOnly` dialog fetch stays cheap.
- The in-route `cache` keys on `n:`/`g:` prefix + sorted ids, so the enriched payload caches correctly with no key change.
- `Promise.all` keeps total latency ≈ max(narrative, pastContext) rather than the sum.

---

## STEP 2 — Frontend: `app/(admin)/ai-risk-assessment/page.tsx`

### 2a. Add a local type alias for `IncidentPastContext`

Near the existing alias (line ~330):

```ts
type IncidentNarrative = import('@/lib/services/openai-service').IncidentDetailNarrative;
```

add:

```ts
type IncidentPastContext = import('@/app/api/risk-assessment/incident-details/route').IncidentPastContext;
```

### 2b. Update the client narrative cache to also hold `pastContext`

Current (line ~300):

```ts
const incidentNarrativeCache = new Map<string, { data: import('@/lib/services/openai-service').IncidentDetailNarrative; expiresAt: number }>();
```

Replace with:

```ts
const incidentNarrativeCache = new Map<string, {
  data: { narrative: IncidentNarrative; pastContext: IncidentPastContext | null };
  expiresAt: number;
}>();
```

> The `IncidentNarrative` / `IncidentPastContext` aliases are declared just below this line in the file today. If TypeScript complains about use-before-declaration for a `type` alias (it should not — `type` aliases are hoisted), move the two `type` alias lines above this cache declaration.

### 2c. `GroupAccordionItem`: add state + carry `pastContext` through the fetch

Current state (lines ~341–343):

```ts
  const [narrative, setNarrative] = useState<IncidentNarrative | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

Add one line:

```ts
  const [narrative, setNarrative] = useState<IncidentNarrative | null>(null);
  const [pastContext, setPastContext] = useState<IncidentPastContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
```

Current effect body (lines ~347–370). Update the cache read and the `.then(...)`:

Cache read — replace:

```ts
    const cached = incidentNarrativeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setNarrative(cached.data);
      return;
    }
```

with:

```ts
    const cached = incidentNarrativeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setNarrative(cached.data.narrative);
      setPastContext(cached.data.pastContext);
      return;
    }
```

`.then(...)` — replace:

```ts
      .then((d) => {
        if (d.narrative) {
          incidentNarrativeCache.set(cacheKey, { data: d.narrative, expiresAt: Date.now() + 10 * 60 * 1000 });
          setNarrative(d.narrative);
        }
      })
```

with:

```ts
      .then((d) => {
        if (d.narrative) {
          incidentNarrativeCache.set(cacheKey, {
            data: { narrative: d.narrative, pastContext: d.pastContext ?? null },
            expiresAt: Date.now() + 10 * 60 * 1000,
          });
          setNarrative(d.narrative);
          setPastContext(d.pastContext ?? null);
        }
      })
```

> The effect guard `if (!isOpen || narrative || loading || error) return;` stays as-is — it keys off `narrative`, which we still set.

### 2d. Remove the disclaimer note and render the new sections

Current narrative block (lines ~418–429):

```tsx
          {narrative && (
            <div className="space-y-4">
              <DetailSection title="Overview" body={narrative.overview} />
              <DetailSection title="Current Status" body={narrative.currentStatus} />
              <DetailSection title="Affected Areas" body={narrative.affectedAreas} />
              <DetailSection title="Key Statistics" body={narrative.keyStatistics} />
              {narrative.historicalContext && <DetailSection title="Historical Context" body={narrative.historicalContext} />}
              <p className="text-[10px] text-slate-400">
                {group.memberIds.length} record(s) · AI-assisted summary, verify before acting.
              </p>
            </div>
          )}
```

Replace with (note: disclaimer `<p>` removed; new sections added after Historical Context):

```tsx
          {narrative && (
            <div className="space-y-4">
              <DetailSection title="Overview" body={narrative.overview} />
              <DetailSection title="Current Status" body={narrative.currentStatus} />
              <DetailSection title="Affected Areas" body={narrative.affectedAreas} />
              <DetailSection title="Key Statistics" body={narrative.keyStatistics} />
              {narrative.historicalContext && <DetailSection title="Historical Context" body={narrative.historicalContext} />}

              {pastContext && (pastContext.matchedEvent || (pastContext.pastDamages?.length ?? 0) > 0 || (pastContext.pastProcedures?.length ?? 0) > 0) && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  {pastContext.matchedEvent && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Closest Past Incident</h4>
                        {typeof pastContext.matchConfidence === 'number' && (
                          <span className="text-[10px] font-bold text-slate-400">{pastContext.matchConfidence}% match</span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700">{renderEmphasis(pastContext.matchedEvent)}</p>
                      {pastContext.similaritySummary && (
                        <p className="text-[13px] leading-relaxed text-slate-600 mt-1">{renderEmphasis(pastContext.similaritySummary)}</p>
                      )}
                    </div>
                  )}
                  <DetailBulletSection title="Past Damages / Losses" items={pastContext.pastDamages} />
                  <DetailBulletSection title="Past Procedures" items={pastContext.pastProcedures} />
                </div>
              )}
            </div>
          )}
```

### 2e. Add the `DetailBulletSection` helper

Place it next to the existing `DetailSection` component (after it, around line ~545):

```tsx
function DetailBulletSection({ title, items }: { title: string; items?: string[] }) {
  const cleaned = (items ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  if (cleaned.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">{title}</h4>
      <ul className="space-y-1.5">
        {cleaned.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span>{renderEmphasis(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> `renderEmphasis` is already defined and used in this file (e.g. lines 285, 494) — it renders `**bold**` markup. No new import needed.

---

## Constraints / gotchas

- **Do not** modify `generateHistoricalPastSummary`, `findSimilarPastEvents`, `pickSeedEvent`, or `computeMatchConfidence`. Reuse as-is.
- `generateHistoricalPastSummary` returns snake_case keys (`matched_event`, `similarity_summary`, `past_damages`, `past_procedures`); the response maps them to camelCase (`matchedEvent`, etc.). Keep that mapping in the route only.
- When no `dataStatus: 'past'` records match, `findSimilarPastEvents` returns `[]` → `pastContext` is `undefined` → the new UI block renders nothing. No empty headings, no errors.
- The `groupsOnly` dialog fetch must remain unchanged (no past lookup there).
- Keep existing import style/ordering and the file's 4-space (route) / 2-space (page) indentation conventions already present in each file.

---

## Verification

1. `npm run build` (or `npx tsc --noEmit`) — no type errors. Confirm the cross-module type import `import('@/app/api/risk-assessment/incident-details/route').IncidentPastContext` resolves.
2. `npm run dev`, sign in as an admin/eoc-role user.
3. Open **AI Risk Assessment** → click a **Learn more** link (prefer earthquake / flood / storm / FEMA bullets — these have numeric similarity paths and are most likely to have seeded past records).
4. Expand an incident and confirm:
   - The "AI-assisted summary, verify before acting." note is **gone**.
   - Overview / Current Status / Affected Areas / Key Statistics / Historical Context still render.
   - A **Closest Past Incident** lead-in (with `% match`) appears, then **Past Damages / Losses** and **Past Procedures** bullet lists, with `**bold**` facts rendered.
   - An incident type with no matching past records shows **no** new section (and no errors).
5. Re-open the same incident → served from the 10-min client cache (no second spinner), past sections still present.
6. In DevTools Network, inspect `POST /api/risk-assessment/incident-details` (the second call, without `groupsOnly`) → response JSON contains a populated `pastContext`.
