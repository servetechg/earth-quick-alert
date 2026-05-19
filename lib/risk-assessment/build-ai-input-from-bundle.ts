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
} from '@/lib/services/risk-historical-context';
import type { HistoricalHazardEvents } from '@/lib/services/risk-historical-feed-service';

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

/**
 * Builds a `RiskAiPastBlock` from real historical events fetched from live APIs.
 * The full structured event data is placed in `events` and passed to OpenAI,
 * which intelligently extracts statistics and formats the analysis.
 */
function pastBlockFromHistoricalEvents(
    cat: IncidentHistoryCategory,
    historical: HistoricalHazardEvents,
    femaLines: string[],
): RiskAiPastBlock {
    const events = historical.by_incident[cat] ?? [];

    // For flood: augment events context with FEMA declaration lines from the live ingest
    // so the AI has both structured past events and the current ingest's FEMA context.
    if (cat === 'flood' && femaLines.length > 0 && events.length === 0) {
        return {
            events: [],
            // Provide the FEMA declaration lines as a fallback context for the AI
            past_damages: femaLines.map((l) => `[FEMA declaration] ${l}`).slice(0, 8),
        };
    }

    return {
        events: events.length ? events : undefined,
    };
}

/**
 * Builds grounded `past` + live `current` **before** OpenAI.
 * Now async because it receives pre-fetched `HistoricalHazardEvents` from live APIs.
 * The `past` context carries real structured events; the model decides what statistics
 * to extract and how to present them.
 */
export async function buildRiskAiOpenAiInput(
    bundle: DashboardIngestBundle,
    heuristicReport: RiskReport,
    historical: HistoricalHazardEvents,
): Promise<RiskAiOpenAiInput> {
    const scope = scopeFromBundle(bundle);
    const state_cd = bundle.stateCd ?? 'us';
    const ingested_at = bundle.ingestedAt ?? heuristicReport.generated_at;
    const femaLines = femaFloodLinesFromBundle(bundle);
    const live = buildLiveHistoricalContext(bundle, heuristicReport);

    const activeCats = incidentCategoriesWithPositiveChartCount(heuristicReport);
    const by_incident: RiskAiPastContext['by_incident'] = {};
    for (const cat of INCIDENT_HISTORY_TAB_KEYS) {
        if (!activeCats.includes(cat)) continue;
        by_incident[cat] = pastBlockFromHistoricalEvents(cat, historical, femaLines);
    }

    // Rollup uses the highest bar-chart-count active category
    const distro = heuristicReport.incident_distribution ?? [];
    const rollupCat = [...activeCats].sort((a, b) => {
        const n = (cat: string) =>
            Math.max(0, Math.floor(distro.find((x) => x.category === cat)?.count ?? 0));
        return n(b) - n(a);
    })[0];
    const rollup: RiskAiPastBlock = rollupCat
        ? pastBlockFromHistoricalEvents(rollupCat, historical, femaLines)
        : {};

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
        const lines = liveBy[cat as IncidentHistoryCategory]?.current_procedures;
        if (lines?.length) byIncidentCurrent[cat as IncidentHistoryCategory] = { current_procedures: lines };
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
