import {
    INCIDENT_HISTORY_TAB_KEYS,
    type DashboardIngestBundle,
    type HistoricalAnalysis,
    type RiskAiCurrentContext,
    type RiskAiPastBlock,
    type RiskAiPastContext,
    type RiskReport,
} from '@/lib/types/risk-assessment';

function toPastBlock(analysis: HistoricalAnalysis | undefined): RiskAiPastBlock {
    if (!analysis) return {};
    return {
        matched_event: analysis.matched_event,
        similarity_summary: analysis.similarity_summary,
        past_damages: analysis.past_damages,
        past_procedures: analysis.past_procedures,
        future_measures: analysis.future_measures,
    };
}

function toCurrentBlock(analysis: HistoricalAnalysis | undefined): { current_procedures?: string[] } {
    const lines = analysis?.current_procedures;
    return lines?.length ? { current_procedures: lines } : {};
}

function buildByIncidentPast(
    report: RiskReport,
): RiskAiPastContext['by_incident'] {
    const src = report.historical_analysis_by_incident ?? {};
    const out: RiskAiPastContext['by_incident'] = {};
    for (const key of INCIDENT_HISTORY_TAB_KEYS) {
        const block = src[key];
        if (!block) continue;
        const past = toPastBlock(block);
        const hasContent =
            past.matched_event ||
            past.similarity_summary ||
            (past.past_damages?.length ?? 0) > 0 ||
            (past.past_procedures?.length ?? 0) > 0 ||
            (past.future_measures?.length ?? 0) > 0;
        if (hasContent) out[key] = past;
    }
    return out;
}

function buildByIncidentCurrent(
    report: RiskReport,
): RiskAiCurrentContext['by_incident'] {
    const src = report.historical_analysis_by_incident ?? {};
    const out: RiskAiCurrentContext['by_incident'] = {};
    for (const key of INCIDENT_HISTORY_TAB_KEYS) {
        const block = src[key];
        if (!block?.current_procedures?.length) continue;
        out[key] = toCurrentBlock(block);
    }
    return out;
}

/**
 * Splits a finalized risk report + ingest bundle into `past` and `current` payloads
 * for downstream AI services (historical comparison vs live operational picture).
 */
export function buildRiskAiContextPack(
    report: RiskReport,
    bundle: DashboardIngestBundle,
): { past: RiskAiPastContext; current: RiskAiCurrentContext } {
    const scope: 'nationwide' | 'state' = bundle.ingestScope === 'state' ? 'state' : 'nationwide';
    const state_cd = bundle.stateCd ?? 'us';
    const ingested_at = bundle.ingestedAt ?? report.generated_at;

    const past: RiskAiPastContext = {
        scope,
        state_cd,
        ingested_at,
        rollup: toPastBlock(report.historical_analysis),
        by_incident: buildByIncidentPast(report),
    };

    const current: RiskAiCurrentContext = {
        scope,
        state_cd,
        ingested_at,
        ingest_narrative: bundle.narrative ?? '',
        rollup: toCurrentBlock(report.historical_analysis),
        by_incident: buildByIncidentCurrent(report),
        findings: {
            meteorological: report.meteorological_findings ?? [],
            hydrological: report.hydrological_findings ?? [],
            fire: report.fire_findings ?? [],
        },
        summaries: {
            meteorological: report.meteorological_summary ?? '',
            hydrological: report.hydrological_risk ?? '',
            fire: report.fire_threats ?? '',
            recommendations: report.recommendations ?? '',
        },
        incident_distribution: report.incident_distribution ?? [],
        alerts_count: report.alerts_count ?? 0,
        domain_severities: report.domain_severities ?? {},
        overall_risk_level: report.overall_risk_level ?? '',
        recommendations_list: report.recommendations_list ?? [],
        populations_at_risk: report.populations_at_risk ?? 0,
        ready2go_users_reachable: report.ready2go_users_reachable ?? 0,
    };

    return { past, current };
}
