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

function sortedIncidentDistribution(report: RiskReport) {
    return [...(report.incident_distribution ?? [])].sort((a, b) => (b.count || 0) - (a.count || 0));
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
    const top = sortedIncidentDistribution(report)[0];
    const eventType = `${report.overall_risk_level || 'UNKNOWN'} risk · ${
        top ? `${top.category} (${top.count})` : 'multi-feed snapshot'
    }`;
    const summary = [report.meteorological_summary, report.hydrological_risk].filter(Boolean).join(' ').trim();
    const description =
        (summary.length > 110 ? `${summary.slice(0, 107)}…` : summary) ||
        `${scope}. ${report.alerts_count ?? 0} aligned incident-class signals — open AI Risk Assessment for the full report and PDF export.`;
    const date = new Date(report.generated_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    const status: 'Active' | 'Monitoring' =
        (report.alerts_count ?? 0) > 0 || (report.major_incidents ?? 0) > 0 ? 'Active' : 'Monitoring';
    return { eventType, description, date, status };
}

/** Timeline rows for Dashboard B — derived from the same live risk report. */
export function buildTimelineFromReport(report: RiskReport | null): Array<{
    time: string;
    event: string;
    tone: 'red' | 'amber' | 'navy' | 'slate';
}> {
    if (!report) return [];
    const tones = ['red', 'amber', 'navy', 'slate'] as const;
    const fromDistro = sortedIncidentDistribution(report)
        .filter((d) => (d.count ?? 0) > 0)
        .slice(0, 4)
        .map((d, idx) => ({
            time: `${d.count}`,
            event: `${d.category} signals in scope`,
            tone: tones[idx] ?? 'navy',
        }));
    if (fromDistro.length > 0) return fromDistro;

    return (report.recommendations_list ?? []).slice(0, 4).map((r) => ({
        time: r.priority,
        event: r.action,
        tone: (r.priority === 'IMMEDIATE' ? 'red' : r.priority === 'URGENT' ? 'amber' : 'navy') as
            | 'red'
            | 'amber'
            | 'navy',
    }));
}

/** Key-impact metric values for Dashboard B (icons applied by the card). */
export function buildKeyImpactMetricsFromReport(report: RiskReport | null): Array<{
    label: string;
    value: string;
}> {
    const pop = report?.populations_at_risk ?? 0;
    const users = report?.ready2go_users_reachable;
    return [
        {
            label: 'Population at Risk',
            value: pop > 0 ? pop.toLocaleString() : '0',
        },
        {
            label: 'Ready2Go Users Reachable',
            value: typeof users === 'number' ? users.toLocaleString() : '—',
        },
        {
            label: 'Major Incidents',
            value: String(report?.major_incidents ?? 0),
        },
        {
            label: 'Aligned Alert Signals',
            value: String(report?.alerts_count ?? 0),
        },
    ];
}
