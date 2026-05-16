import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import { runDashboardIngest } from '@/lib/services/risk-ingest-service';
import { openaiService } from '@/lib/services/openai-service';
import { countReady2GoReachableUsers } from '@/lib/services/ready2go-reachable-users';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';
import { fetchAlignedAlertCommunicationFeed } from '@/lib/services/alert-communication-aligned-feed';
import { applyRiskReportToAlignedAlertFeed } from '@/lib/services/risk-report-alert-alignment';
import { resolveRiskIngestScopeForSession } from '@/lib/risk-assessment/resolve-ingest-scope';

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

        let body: {
            stateCd?: string;
            nwpsGaugeId?: string;
            usgsSite?: string;
            nationwide?: boolean;
            /** When true, append an activity-log row (use only for explicit “Generate report” from AI Risk Assessment). */
            recordActivity?: boolean;
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

        const bundle = await runDashboardIngest({
            stateCd,
            nwpsGaugeId,
            usgsSite,
            nationwide: useNationwide,
        });
        const reachable = await countReady2GoReachableUsers(bundle.riskExposure ?? undefined);
        let report = await openaiService.synthesizeDashboardRiskReport(bundle);

        const pop =
            bundle.riskExposure != null
                ? bundle.riskExposure.populationAffectedEstimate
                : report.populations_at_risk;

        report = {
            ...report,
            populations_at_risk: pop,
            ready2go_users_reachable: reachable,
        };

        const alignedAlerts = await fetchAlignedAlertCommunicationFeed({
            userId: session.user.id as string | undefined,
            role,
        });
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
                reachableReady2GoUsers: reachable,
                riskExposureVintage: bundle.riskExposure?.censusVintageLabel ?? null,
                /** Same live rows as Alerts & Communication after refresh + role filter (KPIs are aligned to this). */
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
