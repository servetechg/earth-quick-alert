import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runDashboardIngest } from '@/lib/services/risk-ingest-service';
import { openaiService } from '@/lib/services/openai-service';
import { countReady2GoReachableUsers } from '@/lib/services/ready2go-reachable-users';

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
        const session = await getSession();
        const role = session?.user?.role as string | undefined;
        if (!session?.user?.email || !role || !ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: { stateCd?: string; nwpsGaugeId?: string; usgsSite?: string } = {};
        try {
            body = await req.json();
        } catch {
            /* empty body */
        }

        const stateCd = typeof body.stateCd === 'string' && body.stateCd.length === 2 ? body.stateCd.toLowerCase() : 'ca';
        const nwpsGaugeId =
            typeof body.nwpsGaugeId === 'string' && body.nwpsGaugeId.length > 0 ? body.nwpsGaugeId : 'SACC1';
        const usgsSite = typeof body.usgsSite === 'string' && body.usgsSite.length > 0 ? body.usgsSite : undefined;

        const bundle = await runDashboardIngest({ stateCd, nwpsGaugeId, usgsSite });
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

        return NextResponse.json({
            report,
            ingest: {
                successfulSources: bundle.successfulSources,
                totalSignals: bundle.totalSignals,
                ingestedAt: bundle.ingestedAt,
                stateCd: bundle.stateCd,
                nwpsGaugeId: bundle.nwpsGaugeId,
                usgsSite: bundle.usgsSite,
                populationsAtRiskAcsEstimate: bundle.riskExposure?.populationAffectedEstimate ?? null,
                reachableReady2GoUsers: reachable,
                riskExposureVintage: bundle.riskExposure?.censusVintageLabel ?? null,
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
