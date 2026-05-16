import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import type { RiskReport } from '@/lib/types/risk-assessment';

export type RiskAnalyzeClientContext = {
    role: string;
    stateRaw: string;
    /** Lowercase USPS when sub-admin jurisdiction is known, else null. */
    stateCd: string | null;
};

/**
 * Same scope rules as `/ai-risk-assessment`: super-admin (etc.) = nationwide ingest;
 * sub-admin with a resolvable `User.state` = single-state AOI.
 */
export function getRiskAnalyzeContextFromBrowser(
    me?: { role?: string | null; state?: string | null } | null,
): RiskAnalyzeClientContext {
    const role = (
        me?.role ||
        (typeof window !== 'undefined' ? localStorage.getItem('userRole') : null) ||
        ''
    )
        .toString()
        .toLowerCase();
    const stateRaw = (
        me?.state ||
        (typeof window !== 'undefined' ? localStorage.getItem('userState') : null) ||
        ''
    )
        .toString()
        .trim();
    const usps = role === 'sub-admin' ? normalizeStateToUsps(stateRaw) : null;
    const stateCd = usps && /^[A-Z]{2}$/i.test(usps) ? usps.toLowerCase() : null;
    return { role, stateRaw, stateCd };
}

export function buildRiskAnalyzeRequestBody(
    ctx: RiskAnalyzeClientContext,
    options?: { recordActivity?: boolean },
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        recordActivity: options?.recordActivity === true,
    };
    if (ctx.role === 'sub-admin' && ctx.stateCd) {
        body.nationwide = false;
        body.stateCd = ctx.stateCd;
    }
    return body;
}

/** Map ingest overall level to the admin dashboard gauge label copy. */
export function mapOverallRiskToGaugeLabel(level: string): 'Low' | 'Moderate' | 'High Risk' | 'Extreme' {
    const u = (level || '').toUpperCase();
    if (u === 'CRITICAL' || u === 'SEVERE') return 'Extreme';
    if (u === 'HIGH') return 'High Risk';
    if (u === 'ELEVATED') return 'Moderate';
    return 'Low';
}

/** One-line incident card copy from the same `RiskReport` as AI Risk Assessment. */
export function buildIncidentOverviewFromReport(
    report: RiskReport,
    opts?: { ingestScope?: string; stateCd?: string },
): {
    eventType: string;
    description: string;
    date: string;
    status: 'Active' | 'Resolved' | 'Monitoring';
} {
    const scope =
        opts?.ingestScope === 'state' && opts.stateCd
            ? `State-scoped live ingest (${opts.stateCd.toUpperCase()})`
            : 'Nationwide live ingest';
    const top = [...(report.incident_distribution ?? [])].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    const eventType = `${report.overall_risk_level || 'UNKNOWN'} risk · ${
        top ? `${top.category} (${top.count})` : 'multi-feed snapshot'
    }`;
    const summary = [report.meteorological_summary, report.hydrological_risk].filter(Boolean).join(' ').trim();
    const description =
        (summary.length > 240 ? `${summary.slice(0, 237)}…` : summary) ||
        `${scope}. ${report.alerts_count ?? 0} aligned incident-class signals — open AI Risk Assessment for the full report and PDF export.`;
    const date = new Date(report.generated_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    const status: 'Active' | 'Monitoring' =
        (report.alerts_count ?? 0) > 0 || (report.major_incidents ?? 0) > 0 ? 'Active' : 'Monitoring';
    return { eventType, description, date, status };
}
