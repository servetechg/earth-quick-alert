Ready for review
Select text to add comments on the plan
AI Risk Assessment — "Learn More" In-Depth Incident Summary
Context
The AI Risk Assessment dashboard renders severity buckets, each containing categories, each containing AI-summarized bullets (e.g. "Flood Watch for Cherokee, Clay, Anderson, Grainger… active until May 26"). Each bullet is dense by design — it represents one or several real events compressed by OpenAI into a single line.

Users need a way to drill into the full story behind a bullet: open a modal that shows an in-depth AI-generated narrative built from the complete properties of the exact incident(s) that bullet represents, plus the raw chip-strip metadata (source, state, counties, timestamp, coords).

The non-trivial problem
The current bullets are emitted as a string[] array, and the page pairs bullets[i] with groups[i] by index (page.tsx:335). This pairing is only correct when AI emits one bullet per group. The current prompt allows "Cluster events by affected state or county — one bullet per cluster" — so when there are many groups, one bullet can implicitly cover multiple groups, and the bullets[i] ↔ groups[i] index pairing silently breaks.

The "Learn More" feature must know precisely which events a bullet represents, so we fetch and summarize the right docs and never accidentally pull in events from a sibling bullet. The fix is to make AI declare, per bullet, the exact Mongo _id list it used.

User-confirmed UX decisions
Popup style: centered modal (components/ui/dialog.tsx)
Content: chip strip metadata at top + AI-generated deep narrative with sections (overview, current status, affected areas, key statistics, instructions)
Caching: in-memory client cache + 10-minute server cache keyed by sorted event IDs
Implementation Order
Fix A — Structured bullet output with event refs (foundation; every other step depends on it)
Fix B — New generateIncidentDetailNarrative OpenAI method
Fix C — New POST /api/risk-assessment/incident-details endpoint
Fix D — LearnMoreButton + IncidentDetailDialog UI
Fix A — Structured Bullet Output with Event Refs
Goal
Replace bullets: string[] with bullets: BulletWithRefs[], where each bullet declares the Mongo _ids it summarizes. AI is told to always tag each bullet with the event IDs it used. This eliminates the fragile bullets[i] ↔ groups[i] index pairing.

Type changes — lib/types/risk-assessment.ts
/** One AI-generated bullet with the exact event _ids it summarizes. */
export interface BulletWithRefs {
  text: string;
  /** Mongo _id strings of every event represented in this bullet. Always length >= 1. */
  eventIds: string[];
}

export interface SeverityCategoryItem {
  category: string;
  eventCount: number;
  groupCount: number;
  bullets: BulletWithRefs[];   // was: string[]
  groups: EventGroupSummary[];
}
OpenAI projection — lib/services/openai-service.ts:1267
Add _ref (stable Mongo _id string) to every projected event so AI can echo it back:

private projectEventForAI(e: UnifiedEventDoc) {
    return {
        _ref: String(e._id),     // NEW — stable handle AI must echo per bullet
        name: e.name,
        category: e.category,
        severity: e.severity,
        location: e.location,
        formattedTimestamp: formatEventTimestamp(e),
        expiresAt: e.expiresAt,
        description: e.description,
        instructions: e.instructions,
        properties: e.properties,
        source: e.source,
        status: e.status,
    };
}
Prompt + response schema — generateSeverityCategorySummary
Change return type to BulletWithRefs[] and require the model to attach eventRefs per bullet. Includes validation that drops invented refs and an orphan-rescue that ensures no input event is silently dropped:

async generateSeverityCategorySummary(input: {
    severity: 'Low' | 'Moderate' | 'High' | 'Extreme';
    category: string;
    events: UnifiedEventDoc[];
}): Promise<BulletWithRefs[]> {
    const fallback: BulletWithRefs[] = [{
        text: `${input.events.length} active ${input.category} event(s) at ${input.severity} severity in ${[...new Set(input.events.map((e) => e.location))].slice(0, 3).join(', ')}.`,
        eventIds: input.events.map((e) => String(e._id)),
    }];

    const result = await this.callOpenAI<{ bullets: { text: string; eventRefs: string[] }[] }>(
        [
            {
                role: 'system',
                content: `${PLAIN_ENGLISH_STYLE_RULES}

You are summarizing all active ${input.category} events at ${input.severity} severity for an executive emergency briefing.

IMPORTANT — output rules:
- Return AT MOST 5 bullets total.
- Cluster events by affected state or county — one bullet per cluster.
- Every event must be represented in at least one bullet. Do NOT drop any events silently.
- Do NOT produce a single semicolon-joined mega-bullet listing every event on one line.
- Do NOT use placeholder text like "N more events" — represent all events within the 5-bullet limit by clustering.
- FEMA grouping rule: events sharing femaDisasterNumber are ONE disaster — collapse into one bullet listing every affected county.

EVENT REFERENCE TRACKING — REQUIRED:
- Every input event has a "_ref" string field. You MUST echo back the exact "_ref" values of every event included in each bullet under "eventRefs".
- "eventRefs" is an array of strings, length >= 1, containing every _ref the bullet covers.
- Union of all "eventRefs" across all bullets MUST equal the full input set — no event may be silently dropped.
- Do NOT invent _ref values. Only return strings that appeared in the input.

Return JSON: {"bullets": [{"text": "<sentence>", "eventRefs": ["<_ref>", ...]}, ...]}.`,
            },
            {
                role: 'user',
                content: JSON.stringify(input.events.map((e) => this.projectEventForAI(e))),
            },
        ],
        { bullets: fallback.map((b) => ({ text: b.text, eventRefs: b.eventIds })) },
        { max_tokens: 2000 },
    );

    // Validate: keep only refs that actually exist; drop empty bullets.
    const validRefs = new Set(input.events.map((e) => String(e._id)));
    const cleaned: BulletWithRefs[] = result.bullets
        .map((b) => ({
            text: b.text,
            eventIds: (b.eventRefs ?? []).filter((r) => validRefs.has(r)),
        }))
        .filter((b) => b.text && b.eventIds.length > 0);

    if (cleaned.length === 0) return fallback;

    // Safety net: ensure every input event is referenced by at least one bullet.
    const referenced = new Set(cleaned.flatMap((b) => b.eventIds));
    const missing = [...validRefs].filter((r) => !referenced.has(r));
    if (missing.length > 0) {
        cleaned[cleaned.length - 1].eventIds.push(...missing);
    }
    return cleaned;
}
Route adapter — app/api/risk-assessment/severity-summaries/route.ts
Update BucketResult.bullets type from string[] to BulletWithRefs[]. No other route logic changes — the route returns whatever generateSeverityCategorySummary produces.

UI adapter — app/(admin)/ai-risk-assessment/page.tsx:307 (CategorySubBlock)
Read .text and .eventIds instead of treating bullet as a string. Replace lines 310 and 329-337:

const bullets: BulletWithRefs[] = (cat.bullets ?? [])
    .map((b) => ({ text: normalizeAiBullet(b.text), eventIds: b.eventIds ?? [] }))
    .filter((b) => b.text);

// inside the <ul>:
{visible.map((b, i) => (
    <li key={i} className="flex flex-col gap-1 text-sm leading-relaxed text-slate-700">
        <div className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span className="flex-1">{renderEmphasis(b.text)}</span>
        </div>
        {groups[i] && <div className="pl-3.5"><EventChipStrip group={groups[i]} /></div>}
        <div className="pl-3.5">
            <LearnMoreButton eventIds={b.eventIds} bulletText={b.text} />
        </div>
    </li>
))}
Verify normalizeAiBullet in lib/utils/normalize-ai-text.ts accepts a string argument; pass b.text explicitly.

PDF export
If buildPdf reads bullets as strings, switch to reading bullets[i].text to preserve behavior.

Fix B — generateIncidentDetailNarrative OpenAI Method
Goal
A new OpenAI method that, given a small set of UnifiedEventDocs (the events behind one bullet), produces a structured deep-dive narrative.

File — lib/services/openai-service.ts
Add after generateSeverityCategorySummary:

export interface IncidentDetailNarrative {
    overview: string;          // 2-3 sentences. What happened, where, when.
    currentStatus: string;     // Active/expiring/resolving + key timing.
    affectedAreas: string;     // Counties / zones / coords summarized.
    keyStatistics: string;     // Wind, gauge, magnitude, casualties, aid, etc.
    instructions: string;      // What residents/responders should do. "" if no guidance.
    historicalContext: string; // Optional 1-2 sentences referencing similar past events. "" if none.
}

async generateIncidentDetailNarrative(input: {
    events: UnifiedEventDoc[];
}): Promise<IncidentDetailNarrative> {
    const fallback: IncidentDetailNarrative = {
        overview: `${input.events.length} incident record(s) summarized.`,
        currentStatus: 'See raw chip metadata.',
        affectedAreas: input.events.map((e) => e.location).join('; '),
        keyStatistics: '',
        instructions: input.events.flatMap((e) => e.instructions ?? []).slice(0, 3).join(' '),
        historicalContext: '',
    };
    const result = await this.callOpenAI<IncidentDetailNarrative>(
        [
            {
                role: 'system',
                content: `${PLAIN_ENGLISH_STYLE_RULES}

You are writing an in-depth incident briefing for an emergency operations center. The user clicked "Learn More" on a single bullet that summarized the incident(s) below.

Produce a structured JSON object with these fields (all strings, all required, use empty string "" when not applicable):
  - overview        — 2-3 sentence plain-English description of what is happening.
  - currentStatus   — current state, ongoing/expiring, key timing (use formattedTimestamp + expiresAt).
  - affectedAreas   — counties, zones, states, lat/lng where given.
  - keyStatistics   — pull EVERY non-null numeric, monetary, and named field from properties (intensity, gauge height, wind, magnitude, deaths, damage, aid totals, designated area, etc.). Wrap numbers in **double asterisks**.
  - instructions    — combined safety guidance from the events' instructions arrays.
  - historicalContext — only if obvious similar-past-event references appear in description. Otherwise "".

Rules:
- Be specific. Cite numbers from properties. Never invent data.
- If multiple events share a femaDisasterNumber, treat them as one disaster across counties (do NOT repeat the disaster).
- Wrap place names and numeric facts in **double asterisks**.
- Each field is 1-4 sentences. The full response should read like an exec briefing, not a data dump.

Return JSON exactly: {"overview": "...", "currentStatus": "...", "affectedAreas": "...", "keyStatistics": "...", "instructions": "...", "historicalContext": ""}.`,
            },
            {
                role: 'user',
                content: JSON.stringify(input.events.map((e) => this.projectEventForAI(e))),
            },
        ],
        fallback,
        { max_tokens: 1400 },
    );
    return result;
}
Fix C — POST /api/risk-assessment/incident-details
Goal
Server endpoint that takes a list of event IDs, fetches the docs from Mongo (with role check), and returns { groups, narrative, eventCount }. Cached for 10 minutes by sorted-ID key.

New file — app/api/risk-assessment/incident-details/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import UnifiedEvent from '@/models/UnifiedEvent';
import { groupRelatedEvents, toEventGroupSummary } from '@/lib/services/event-grouping';
import { openaiService, type IncidentDetailNarrative } from '@/lib/services/openai-service';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import type { EventGroupSummary } from '@/lib/types/risk-assessment';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

const MAX_EVENT_IDS = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { data: unknown; expiresAt: number }>();

export interface IncidentDetailResponse {
    groups: EventGroupSummary[];
    narrative: IncidentDetailNarrative;
    eventCount: number;
}

export async function POST(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: { eventIds?: string[] } = {};
        try { body = await req.json(); } catch { /* empty body */ }
        const rawIds = Array.isArray(body.eventIds) ? body.eventIds : [];
        const eventIds = [...new Set(rawIds.filter((s) => typeof s === 'string' && s.length))]
            .slice(0, MAX_EVENT_IDS);
        if (eventIds.length === 0) {
            return NextResponse.json({ error: 'eventIds required' }, { status: 400 });
        }

        const cacheKey = `det:${eventIds.slice().sort().join(',')}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return NextResponse.json(cached.data);
        }

        const events = (await UnifiedEvent.find({ _id: { $in: eventIds } }).lean()) as unknown as UnifiedEventDoc[];
        if (events.length === 0) {
            return NextResponse.json({ error: 'No matching events' }, { status: 404 });
        }

        const groups = groupRelatedEvents(events);
        const narrative = await openaiService.generateIncidentDetailNarrative({ events });

        const response: IncidentDetailResponse = {
            groups: groups.map(toEventGroupSummary),
            narrative,
            eventCount: events.length,
        };

        cache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_TTL_MS });
        return NextResponse.json(response);
    } catch (e: any) {
        console.error('risk-assessment/incident-details:', e);
        return NextResponse.json({ error: 'Failed to load incident details', message: e?.message }, { status: 500 });
    }
}
Security: ID list capped at 50; only Mongo _ids accepted (no regex / filter injection); session role required.

Fix D — LearnMoreButton + IncidentDetailDialog
File — app/(admin)/ai-risk-assessment/page.tsx
Imports to add:

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BookOpen } from "lucide-react";
import type { IncidentDetailResponse } from "@/app/api/risk-assessment/incident-details/route";
(or re-export the type from lib/types/risk-assessment.ts to keep it shared)

LearnMoreButton
function LearnMoreButton({ eventIds, bulletText }: { eventIds: string[]; bulletText: string }) {
    const [open, setOpen] = useState(false);
    if (eventIds.length === 0) return null;
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#33375D] hover:text-[#1f223a] underline-offset-2 hover:underline"
            >
                <BookOpen className="h-3 w-3" />
                Learn more
                <span className="text-slate-400 font-normal">· {eventIds.length} record(s)</span>
            </button>
            <IncidentDetailDialog
                open={open}
                onOpenChange={setOpen}
                eventIds={eventIds}
                bulletText={bulletText}
            />
        </>
    );
}
IncidentDetailDialog + DetailSection
const incidentDetailCache = new Map<string, { data: IncidentDetailResponse; expiresAt: number }>();

function IncidentDetailDialog({
    open, onOpenChange, eventIds, bulletText,
}: {
    open: boolean;
    onOpenChange: (b: boolean) => void;
    eventIds: string[];
    bulletText: string;
}) {
    const [data, setData] = useState<IncidentDetailResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const cacheKey = eventIds.slice().sort().join(',');
        const cached = incidentDetailCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            setData(cached.data);
            return;
        }
        setLoading(true);
        setError(null);
        setData(null);
        fetch('/api/risk-assessment/incident-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventIds }),
        })
            .then(async (r) => {
                if (!r.ok) throw new Error((await r.json()).message ?? 'Failed to load details');
                return r.json() as Promise<IncidentDetailResponse>;
            })
            .then((d) => {
                incidentDetailCache.set(cacheKey, { data: d, expiresAt: Date.now() + 10 * 60 * 1000 });
                setData(d);
            })
            .catch((e) => setError(e.message ?? 'Failed to load details'))
            .finally(() => setLoading(false));
    }, [open, eventIds]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-extrabold text-slate-800">Incident Details</DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">{bulletText}</DialogDescription>
                </DialogHeader>

                {loading && (
                    <div className="py-10 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                        <p className="mt-2 text-sm text-slate-500">Generating in-depth summary…</p>
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {data && (
                    <div className="space-y-5">
                        <div className="space-y-2">
                            {data.groups.map((g, i) => (
                                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <EventChipStrip group={g} />
                                </div>
                            ))}
                        </div>

                        <DetailSection title="Overview" body={data.narrative.overview} />
                        <DetailSection title="Current Status" body={data.narrative.currentStatus} />
                        <DetailSection title="Affected Areas" body={data.narrative.affectedAreas} />
                        <DetailSection title="Key Statistics" body={data.narrative.keyStatistics} />
                        {data.narrative.instructions && (
                            <DetailSection title="Instructions" body={data.narrative.instructions} />
                        )}
                        {data.narrative.historicalContext && (
                            <DetailSection title="Historical Context" body={data.narrative.historicalContext} />
                        )}

                        <p className="text-[10px] text-slate-400">
                            Built from {data.eventCount} record(s) · AI-assisted summary, verify before acting.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function DetailSection({ title, body }: { title: string; body: string }) {
    if (!body) return null;
    return (
        <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-1.5">{title}</h4>
            <p className="text-sm leading-relaxed text-slate-700">{renderEmphasis(body)}</p>
        </div>
    );
}
Files Changed Summary
File	Change
lib/types/risk-assessment.ts	Add BulletWithRefs; change SeverityCategoryItem.bullets to BulletWithRefs[]; optionally re-export IncidentDetailNarrative / IncidentDetailResponse
lib/services/openai-service.ts	Add _ref to projectEventForAI; change generateSeverityCategorySummary return to BulletWithRefs[] + prompt update + ref validation + orphan rescue; add IncidentDetailNarrative + generateIncidentDetailNarrative
app/api/risk-assessment/severity-summaries/route.ts	Update BucketResult.bullets type to BulletWithRefs[]
app/api/risk-assessment/incident-details/route.ts	NEW — POST endpoint with role check, 50-ID cap, 10-min cache, fetches Mongo docs, runs grouping + AI narrative
app/(admin)/ai-risk-assessment/page.tsx	Update CategorySubBlock bullet rendering to read b.text + b.eventIds; add LearnMoreButton, IncidentDetailDialog, DetailSection; import Dialog, BookOpen
lib/services/risk-assessment-pdf.ts (if exists)	Read bullets[i].text instead of bullets[i]
Verification Checklist
 Bullets render as before; "Learn more · N record(s)" appears under each bullet.
 Clicking "Learn more" opens a centered modal; loading spinner shows briefly.
 Modal shows chip strip(s) at top (source/state/counties/time/coords) AND AI sections (Overview, Current Status, Affected Areas, Key Statistics, Instructions, Historical Context where applicable).
 Second click within 10 min opens instantly (client cache hit). Reopen after 10 min triggers a fresh fetch but hits server cache.
 For a FEMA bullet covering 5 counties: modal shows ONE coherent narrative listing all 5 counties; chip strip shows "covers ..." with full county list.
 For a bullet that clustered 3 distinct NWS alerts: modal shows ALL 3 events' chip strips at top; narrative covers all three.
 Server log shows only the requested _ids queried (db.unifiedevents.find({_id:{$in:[…]}})); no extra DB reads.
 Tampered / non-existent IDs from client → 404; >50 IDs → silently truncated.
 Unauthorized session → 401.
 No "key prop" / "uncontrolled input" warnings in console.
 npx tsc --noEmit clean on all touched files.
Edge Cases Handled in the Plan
AI returns 0 valid eventRefs — fallback bullet receives all input event IDs so "Learn more" still works.
AI returns refs not in the input set — validation filters them out (validRefs.has(r)).
AI drops events from eventRefs entirely — orphan rescue appends missing IDs to the last bullet.
Bullet has eventIds.length === 0 after cleaning — bullet is dropped (invariant: every shown bullet has ≥1 ID).
User clicks Learn More on a bullet covering >50 events — server caps at 50; very rare in practice. Optionally display a "showing top 50" note if eventIds.length > 50.
Out of Scope
Past-event matching / playbook lookups inside the modal (use the existing Historical Context tabs instead).
Editing or annotating incidents from the modal — read-only.
Sharing / deep-link to a specific incident-detail view.
Add Comment