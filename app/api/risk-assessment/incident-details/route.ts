import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import UnifiedEvent from '@/models/UnifiedEvent';
import { groupRelatedEvents, toEventGroupSummary } from '@/lib/services/event-grouping';
import { openaiService, type IncidentDetailNarrative } from '@/lib/services/openai-service';
import { pickSeedEvent, findSimilarPastEvents, computeMatchConfidence } from '@/lib/services/risk-similar-events';
import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';
import type { EventGroupSummary } from '@/lib/types/risk-assessment';
import { resolveDemoSessionContext, buildDemoIncidentDetails } from '@/lib/demo/provider';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

const MAX_EVENT_IDS = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { data: unknown; expiresAt: number }>();

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

export async function POST(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: { eventIds?: string[]; groupsOnly?: boolean } = {};
        try { body = await req.json(); } catch { /* empty body */ }
        const rawIds = Array.isArray(body.eventIds) ? body.eventIds : [];
        const eventIds = [...new Set(rawIds.filter((s) => typeof s === 'string' && s.length))]
            .slice(0, MAX_EVENT_IDS);
        if (eventIds.length === 0) {
            return NextResponse.json({ error: 'eventIds required' }, { status: 400 });
        }

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );
        if (demoCtx) {
            return NextResponse.json(buildDemoIncidentDetails(eventIds));
        }

        const groupsOnly = body.groupsOnly === true;

        const cacheKey = `det:${groupsOnly ? 'g:' : 'n:'}${eventIds.slice().sort().join(',')}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return NextResponse.json(cached.data);
        }

        const events = (await UnifiedEvent.find({ _id: { $in: eventIds } }).lean()) as unknown as UnifiedEventDoc[];
        if (events.length === 0) {
            return NextResponse.json({ error: 'No matching events' }, { status: 404 });
        }

        const groups = groupRelatedEvents(events);

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

        cache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_TTL_MS });
        return NextResponse.json(response);
    } catch (e: any) {
        console.error('risk-assessment/incident-details:', e);
        return NextResponse.json({ error: 'Failed to load incident details', message: e?.message }, { status: 500 });
    }
}
