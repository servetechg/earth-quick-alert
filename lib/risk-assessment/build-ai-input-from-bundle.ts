import {
    INCIDENT_HISTORY_TAB_KEYS,
    type DashboardIngestBundle,
    type IncidentHistoryCategory,
    type RiskAiCurrentContext,
    type RiskAiOpenAiInput,
    type RiskAiPastBlock,
    type RiskAiPastContext,
    type RiskReport,
} from '@/lib/types/risk-assessment';
import {
    buildLiveHistoricalContext,
    incidentCategoriesWithPositiveChartCount,
    playbookPastBlockForCategory,
} from '@/lib/services/risk-historical-context';

function scopeFromBundle(bundle: DashboardIngestBundle): 'nationwide' | 'state' {
    return bundle.ingestScope === 'state' ? 'state' : 'nationwide';
}

function femaFloodLinesFromBundle(bundle: DashboardIngestBundle): string[] {
    const fema = bundle.sources.find((s) => s.source === 'FEMA_OPENFEMA');
    const summary = fema?.summary?.trim() ?? '';
    if (!summary) return [];
    return summary
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !/^no recent fema/i.test(l) && !/^no recent flood disaster/i.test(l));
}

function pastBlockForCategory(
    stateCd: string,
    cat: IncidentHistoryCategory,
    femaLines: string[],
): RiskAiPastBlock {
    const playbook = playbookPastBlockForCategory(stateCd, cat);
    if (cat === 'flood' && femaLines.length > 0) {
        return {
            matched_event: `FEMA flood disaster declarations in ingest (${femaLines.length} record(s))`,
            similarity_summary: playbook.similarity_summary,
            past_damages: [
                ...femaLines.map((l) => `[FEMA declaration] ${l}`),
                ...(playbook.past_damages ?? []).map((l) => `[Typical hazard impact] ${l}`),
            ].slice(0, 10),
            past_procedures: playbook.past_procedures,
            future_measures: playbook.future_measures,
        };
    }
    return {
        ...playbook,
        past_damages: (playbook.past_damages ?? []).map((l) => `[Typical hazard impact] ${l}`),
    };
}

/**
 * Builds grounded `past` + live `current` **before** OpenAI — sent as two explicit context blocks in the model prompt.
 */
export function buildRiskAiOpenAiInput(
    bundle: DashboardIngestBundle,
    heuristicReport: RiskReport,
): RiskAiOpenAiInput {
    const scope = scopeFromBundle(bundle);
    const state_cd = bundle.stateCd ?? 'us';
    const ingested_at = bundle.ingestedAt ?? heuristicReport.generated_at;
    const femaLines = femaFloodLinesFromBundle(bundle);
    const live = buildLiveHistoricalContext(bundle, heuristicReport);

    const activeCats = incidentCategoriesWithPositiveChartCount(heuristicReport);
    const by_incident: RiskAiPastContext['by_incident'] = {};
    for (const cat of INCIDENT_HISTORY_TAB_KEYS) {
        if (!activeCats.includes(cat)) continue;
        by_incident[cat] = pastBlockForCategory(state_cd, cat, femaLines);
    }

    const distro = heuristicReport.incident_distribution ?? [];
    const rollupCat = [...activeCats].sort((a, b) => {
        const n = (cat: string) =>
            Math.max(0, Math.floor(distro.find((x) => x.category === cat)?.count ?? 0));
        return n(b) - n(a);
    })[0];
    const rollup = rollupCat ? pastBlockForCategory(state_cd, rollupCat, femaLines) : {};

    const past: RiskAiPastContext = {
        scope,
        state_cd,
        ingested_at,
        fema_flood_declarations: femaLines,
        rollup,
        by_incident,
    };

    const byIncidentCurrent: RiskAiCurrentContext['by_incident'] = {};
    const liveBy = live.historical_analysis_by_incident ?? {};
    for (const cat of INCIDENT_HISTORY_TAB_KEYS) {
        const lines = liveBy[cat]?.current_procedures;
        if (lines?.length) byIncidentCurrent[cat] = { current_procedures: lines };
    }

    const current: RiskAiCurrentContext = {
        scope,
        state_cd,
        ingested_at,
        ingest_narrative: bundle.narrative ?? '',
        rollup: { current_procedures: live.historical_analysis?.current_procedures },
        by_incident: byIncidentCurrent,
        findings: {
            meteorological: heuristicReport.meteorological_findings ?? [],
            hydrological: heuristicReport.hydrological_findings ?? [],
            fire: heuristicReport.fire_findings ?? [],
        },
        summaries: {
            meteorological: '',
            hydrological: '',
            fire: '',
            recommendations: '',
        },
        incident_distribution: heuristicReport.incident_distribution ?? [],
        alerts_count: heuristicReport.alerts_count ?? 0,
        domain_severities: heuristicReport.domain_severities ?? {},
        overall_risk_level: heuristicReport.overall_risk_level ?? 'MODERATE',
        recommendations_list: heuristicReport.recommendations_list ?? [],
        populations_at_risk: heuristicReport.populations_at_risk ?? 0,
        ready2go_users_reachable: 0,
    };

    return { past, current };
}
