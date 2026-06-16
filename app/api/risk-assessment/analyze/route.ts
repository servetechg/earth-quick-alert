import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { runDashboardIngest } from '@/lib/services/risk-ingest-service';
import { openaiService } from '@/lib/services/openai-service';
import { listUsersInAlignedAlertAreas } from '@/lib/services/users-in-aligned-alert-areas';
import { getOrRevalidate } from '@/lib/services/risk-report-cache';
import {
    buildPopulationAtRiskCacheKey,
    setPopulationAtRiskCache,
} from '@/lib/services/population-at-risk-cache';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';
import {
    fetchAlignedUnifiedEventDocsForSession,
    fetchAlignedUnifiedEventFeed,
    fetchPopulationAtRiskAlignedEventFeed,
} from '@/lib/services/alert-communication-aligned-feed';
import { computeRiskSnapshot } from '@/lib/services/risk-current-snapshot';
import { applyRiskReportToAlignedAlertFeed } from '@/lib/services/risk-report-alert-alignment';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';
import {
    coordinatesInJurisdiction,
    resolveSubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { resolveDemoSessionContext, buildDemoAnalyzeResponse } from '@/lib/demo/provider';

/** Roles allowed to run Dashboard A fusion (aligned with admin operational tooling). */
const ALLOWED_ROLES = new Set([
    'admin',
    'super-admin',
    'sub-admin',
    'eoc-manager',
    'eoc-observer',
    'manager',
    'responder',
    'observer',
]);

export async function POST(req: Request) {
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
            return NextResponse.json(buildDemoAnalyzeResponse());
        }

        let body: {
            stateCd?: string;
            nwpsGaugeId?: string;
            usgsSite?: string;
            nationwide?: boolean;
            /** When true, append an activity-log row (use only for explicit “Generate report” from AI Risk Assessment). */
            recordActivity?: boolean;
            skipHistorical?: boolean;
            /** When true, bypass the server SWR cache and recompute the ingest + report now. */
            forceRefresh?: boolean;
        } = {};
        try {
            body = await req.json();
        } catch {
            /* empty body */
        }

        const scope = await resolveRiskIngestScopeForSession(
            role,
            session.user.id as string | undefined,
            body,
        );
        const useNationwide = scope.nationwide;
        const stateCd = scope.stateCd;
        const nwpsGaugeId =
            typeof body.nwpsGaugeId === 'string' && body.nwpsGaugeId.length > 0 ? body.nwpsGaugeId : 'SACC1';
        const usgsSite = typeof body.usgsSite === 'string' && body.usgsSite.length > 0 ? body.usgsSite : undefined;
        const skipHistorical = body.skipHistorical === true;

        const forceRefresh = body.forceRefresh === true;
        const cacheKey = `analyze:${scope.nationwide ? 'us' : scope.stateCd}:${skipHistorical ? 'card' : 'full'}:v1`;
        const { bundle, report: baseReport } = await getOrRevalidate(cacheKey, async () => {
            const bundle = await runDashboardIngest({
                stateCd,
                nwpsGaugeId,
                usgsSite,
                nationwide: useNationwide,
            });
            const report = await openaiService.synthesizeDashboardRiskReport(bundle, { includeHistorical: !skipHistorical });
            return { bundle, report };
        }, { force: forceRefresh });

        const jurisdiction =
            role === 'sub-admin'
                ? await resolveSubAdminJurisdiction(session.user.id as string)
                : null;

        let exposure = bundle.riskExposure ?? undefined;
        if (jurisdiction && exposure) {
            exposure = {
                ...exposure,
                centroids: exposure.centroids.filter((c) =>
                    coordinatesInJurisdiction(c.lat, c.lon, jurisdiction),
                ),
            };
        }

        let report = baseReport;

        // Align the two headline KPIs (overall risk level + AI confidence) with the dashboard
        // card's `/summary` endpoint: compute them from the SAME aligned UnifiedEvent docs using
        // the SAME computeRiskSnapshot() math, so both surfaces show identical, stable values.
        // The live-feed/AI-grounded fields (findings, recommendations, narrative) are untouched.
        const snapshotEvents = await fetchAlignedUnifiedEventDocsForSession({
            userId: session.user.id as string | undefined,
            role,
        });
        const snapshot = computeRiskSnapshot(snapshotEvents, {
            aiAvailable: openaiService.isAvailable(),
        });
        report = {
            ...report,
            overall_risk_level: snapshot.overall_risk_level,
            ai_confidence: snapshot.ai_confidence,
        };

        const alignedAlerts = await fetchAlignedUnifiedEventFeed({
            userId: session.user.id as string | undefined,
            role,
        });
        const populationAtRiskRows = await fetchPopulationAtRiskAlignedEventFeed({
            userId: session.user.id as string | undefined,
            role,
        });
        const usersAtRiskList = await listUsersInAlignedAlertAreas(
            populationAtRiskRows,
            jurisdiction,
        );
        setPopulationAtRiskCache(
            buildPopulationAtRiskCacheKey(session.user.id as string, stateCd),
            usersAtRiskList,
        );
        const usersAtRisk = usersAtRiskList.length;

        report = {
            ...report,
            populations_at_risk: usersAtRisk,
            ready2go_users_reachable: usersAtRisk,
        };

        report = applyRiskReportToAlignedAlertFeed(report, alignedAlerts);

        if (body.recordActivity === true) {
            void recordActivity({
                userId: session.user.id,
                action: ACTIVITY_ACTIONS.AI_RISK_REPORT,
                label: 'AI risk assessment report generated',
                meta: {
                    nationwide: useNationwide,
                    totalSignals: bundle.totalSignals,
                    ingestScope: bundle.ingestScope ?? 'nationwide',
                },
            });
        }

        return NextResponse.json({
            report,
            ingest: {
                successfulSources: bundle.successfulSources,
                totalSignals: bundle.totalSignals,
                ingestedAt: bundle.ingestedAt,
                stateCd: bundle.stateCd,
                ingestScope: bundle.ingestScope ?? 'nationwide',
                nwpsGaugeId: bundle.nwpsGaugeId,
                usgsSite: bundle.usgsSite,
                populationsAtRiskAcsEstimate: bundle.riskExposure?.populationAffectedEstimate ?? null,
                reachableReady2GoUsers: usersAtRisk,
                riskExposureVintage: bundle.riskExposure?.censusVintageLabel ?? null,
                /** Same live UnifiedEvent rows as Alerts & Communication after refresh + role filter. */
                aligned_event_count: alignedAlerts.length,
                aligned_alert_count: alignedAlerts.length,
                sources: bundle.sources.map((s) => ({
                    source: s.source,
                    ok: s.ok,
                    error: s.error,
                })),
            },
        });
    } catch (e: any) {
        console.error('risk-assessment analyze:', e);
        return NextResponse.json(
            { error: 'Failed to generate risk assessment', message: e?.message },
            { status: 500 },
        );
    }
}
