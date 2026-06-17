import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import { fetchAlignedUnifiedEventDocsForSession } from '@/lib/services/alert-communication-aligned-feed';
import { findSimilarPastEvents, computeMatchConfidence, pickSeedEvent } from '@/lib/services/risk-similar-events';
import { getActiveRespondersForCategory } from '@/lib/services/risk-responder-data';
import { openaiService } from '@/lib/services/openai-service';
import type { HistoricalTabPayload } from '@/lib/types/risk-assessment';
import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';
import { getOrRevalidate } from '@/lib/services/risk-report-cache';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

export async function POST(
    req: Request,
    { params }: { params: Promise<{ category: string }> | { category: string } },
) {
    const { category: categoryParam } = await Promise.resolve(params);

    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!categoryParam?.trim()) {
            return NextResponse.json({ error: 'Missing category' }, { status: 400 });
        }

        const category = normalizeUnifiedEventCategory(categoryParam);

        let body: { stateCd?: string; nationwide?: boolean; forceRefresh?: boolean } = {};
        try { body = await req.json(); } catch { /* empty body */ }
        const forceRefresh = body.forceRefresh === true;

        const scope = await resolveRiskIngestScopeForSession(
            role,
            session.user.id as string | undefined,
            body,
        );

        const cacheKey = `hist:${session.user.id}:${scope.stateCd}:${category}:aligned-v3`;

        // Same aligned feed as Alerts & Communication, scoped to this category
        const allCurrent = await fetchAlignedUnifiedEventDocsForSession({
            userId: session.user.id as string | undefined,
            role,
        });
        const currentEvents = allCurrent.filter(
            (e) => normalizeUnifiedEventCategory(e.category) === category,
        );

        if (currentEvents.length === 0) {
            return NextResponse.json({ error: 'No active events for this category' }, { status: 404 });
        }

        const payload = await getOrRevalidate(cacheKey, async () => {
            const seedEvent = pickSeedEvent(currentEvents);

            // Find similar past events + active responders in parallel
            const [similarPast, activeResponders] = await Promise.all([
                findSimilarPastEvents(seedEvent, 3),
                getActiveRespondersForCategory(category),
            ]);
            const hasSimilarPast = similarPast.length > 0;
            const match_confidence = computeMatchConfidence(seedEvent, similarPast);

            // Run Call A (past summary) and Call B (current summary + responder data) in parallel
            const [pastResult, currentResult] = await Promise.all([
                openaiService.generateHistoricalPastSummary({ category, similarPastEvents: similarPast, currentSeed: seedEvent }),
                openaiService.generateHistoricalCurrentSummary({ category, currentEvents, activeResponders }),
            ]);

            // Call C (future measures) depends on A + B
            const futureResult = await openaiService.generateHistoricalFutureMeasures({
                category,
                pastSummary: pastResult,
                currentSummary: currentResult,
            });

            // Call D (per-category strategic plan) depends on C
            const categoryRecommendations = await openaiService.generateCategoryStrategicPlan({
                category,
                futureMeasures: futureResult.future_measures ?? [],
            });

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
                recommendations_list: categoryRecommendations,
            };
            return payload;
        }, { force: forceRefresh });

        return NextResponse.json(payload);
    } catch (e: any) {
        console.error(`risk-assessment/historical/${categoryParam}:`, e);
        return NextResponse.json({ error: 'Failed to generate historical context', message: e?.message }, { status: 500 });
    }
}
