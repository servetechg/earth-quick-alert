import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { computeRiskSnapshot } from '@/lib/services/risk-current-snapshot';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import {
    fetchAlignedUnifiedEventDocsForSession,
    fetchAlignedUnifiedEventFeed,
    fetchPopulationAtRiskAlignedEventFeed,
} from '@/lib/services/alert-communication-aligned-feed';
import { applyRiskReportToAlignedAlertFeed } from '@/lib/services/risk-report-alert-alignment';
import { openaiService } from '@/lib/services/openai-service';
import { listUsersInAlignedAlertAreas } from '@/lib/services/users-in-aligned-alert-areas';
import {
    buildPopulationAtRiskCacheKey,
    setPopulationAtRiskCache,
} from '@/lib/services/population-at-risk-cache';
import { resolveSubAdminJurisdiction } from '@/lib/sub-admin/jurisdiction';
import { resolveDemoSessionContext, buildDemoSummaryResponse } from '@/lib/demo/provider';
import { getOrRevalidate } from '@/lib/services/risk-report-cache';
import { computeCensusExposureFromAlertRows } from '@/lib/services/alert-area-census-exposure';
import { computeCriticalInfraAtRiskFromAlertRows } from '@/lib/services/alert-area-critical-infra-exposure';

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
            return NextResponse.json(buildDemoSummaryResponse());
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

        const cacheKey = `${session.user.id}:${scope.stateCd}:aligned-v10-ci-alert`;

        const response = await getOrRevalidate(cacheKey, async () => {
            const events = await fetchAlignedUnifiedEventDocsForSession({
                userId: session.user.id as string | undefined,
                role,
            });
            const alignedCards = await fetchAlignedUnifiedEventFeed({
                userId: session.user.id as string | undefined,
                role,
            });
            const aiAvailable = openaiService.isAvailable();
            const snapshot = computeRiskSnapshot(events, { aiAvailable });
            const aligned = applyRiskReportToAlignedAlertFeed(
                {
                    ...snapshot,
                    recommendations: '',
                    recommendations_list: [],
                    historical_analysis: {},
                } as unknown as Parameters<typeof applyRiskReportToAlignedAlertFeed>[0],
                alignedCards,
            );

            const jurisdiction =
                role === 'sub-admin'
                    ? await resolveSubAdminJurisdiction(session.user.id as string)
                    : null;
            const populationAtRiskRows = await fetchPopulationAtRiskAlignedEventFeed({
                userId: session.user.id as string | undefined,
                role,
            });
            const populationAtRiskUsers = await listUsersInAlignedAlertAreas(
                populationAtRiskRows,
                jurisdiction,
            );
            setPopulationAtRiskCache(
                buildPopulationAtRiskCacheKey(session.user.id as string, scope.stateCd),
                populationAtRiskUsers,
            );

            const scopeStateUsps =
                jurisdiction?.stateCode ??
                (scope.stateCd !== 'us' ? scope.stateCd.toUpperCase() : null);
            const populationExposure = await computeCensusExposureFromAlertRows(alignedCards, {
                defaultStateUsps: scopeStateUsps,
                scopeStateUsps,
                dashboardStateCd: scope.stateCd,
                jurisdiction,
            });
            const criticalInfrastructureAtRisk = await computeCriticalInfraAtRiskFromAlertRows(
                alignedCards,
                { jurisdiction },
            );

            // Strip raw event arrays from the response (only needed server-side)
            const { severity_buckets, ...rest } = snapshot;
            const response = {
                ...rest,
                alerts_count: aligned.alerts_count,
                major_incidents: aligned.major_incidents,
                minor_incidents: aligned.minor_incidents,
                incident_distribution: aligned.incident_distribution,
                populations_at_risk: populationExposure?.populationAffectedEstimate ?? 0,
                ready2go_users_at_risk: populationAtRiskUsers.length,
                population_exposure: populationExposure,
                population_at_risk_users: populationAtRiskUsers,
                critical_infrastructure_at_risk: criticalInfrastructureAtRisk,
                ai_available: aiAvailable,
                severity_buckets: severity_buckets.map((b) => ({
                    severity: b.severity,
                    categories: b.categories.map((c) => ({
                        category: c.category,
                        eventCount: c.events.length,
                    })),
                })),
            };
            return response;
        }, { force: forceRefresh });

        return NextResponse.json(response);
    } catch (e: any) {
        console.error('risk-assessment/summary:', e);
        return NextResponse.json({ error: 'Failed to compute summary', message: e?.message }, { status: 500 });
    }
}
