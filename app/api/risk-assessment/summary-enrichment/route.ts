import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import { resolveDemoSessionContext } from '@/lib/demo/provider';
import { getOrRevalidate } from '@/lib/services/risk-report-cache';
import {
    buildRiskSummaryEnrichment,
    loadAlignedEventsForRiskSummary,
} from '@/lib/services/risk-summary-builder';

const ALLOWED_ROLES = new Set([
    'admin', 'super-admin', 'sub-admin', 'eoc-manager',
    'eoc-observer', 'manager', 'responder', 'observer',
]);

export async function GET(req: Request) {
    try {
        await dbConnect();
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const demoCtx = await resolveDemoSessionContext(
            session.user.id as string,
            session.user.email as string,
        );
        if (demoCtx) {
            return NextResponse.json({
                populations_at_risk: 0,
                ready2go_users_at_risk: 0,
                population_exposure: null,
                population_at_risk_users: [],
                critical_infrastructure_at_risk: [],
            });
        }

        const url = new URL(req.url);
        const bodyStateCd = url.searchParams.get('stateCd') ?? undefined;
        const bodyNationwide = url.searchParams.get('nationwide') !== 'false';
        const forceRefresh = url.searchParams.get('refresh') === '1';

        const scope = await resolveRiskIngestScopeForSession(
            role,
            session.user.id as string | undefined,
            { nationwide: bodyNationwide, stateCd: bodyStateCd },
        );

        const cacheKey = `${session.user.id}:${scope.stateCd}:summary-enrichment-v1`;

        const enrichment = await getOrRevalidate(
            cacheKey,
            async () => {
                const { cards } = await loadAlignedEventsForRiskSummary({
                    userId: session.user.id as string | undefined,
                    role,
                });
                return buildRiskSummaryEnrichment({
                    userId: session.user.id as string | undefined,
                    role,
                    scope,
                    alignedCards: cards,
                });
            },
            { force: forceRefresh, ttlMs: 300_000, staleMs: 900_000 },
        );

        return NextResponse.json(enrichment);
    } catch (e: any) {
        console.error('risk-assessment/summary-enrichment:', e);
        return NextResponse.json(
            { error: 'Failed to compute enrichment', message: e?.message },
            { status: 500 },
        );
    }
}
