/**
 * Operational "historical context" quadrants keyed to the dominant hazard mix in this ingest.
 * Uses incident_distribution (+ active incident totals), not prose line counts.
 */

import {
    INCIDENT_HISTORY_TAB_KEYS,
    type DashboardIngestBundle,
    type HistoricalAnalysis,
    type IncidentHistoryCategory,
    type DistroPoint,
    type RiskReport,
} from '@/lib/types/risk-assessment';
import {
    classifyNwsIncidentDistributionBucket,
    isFloodRelatedEvent,
} from '@/lib/services/risk-ingest-service';

/**
 * Heuristic / “no signals” ingest lines — must not spawn historical tabs or drown chart alignment.
 */
export function isNoiseIngestFindingLine(line: string): boolean {
    const t = line.trim().toLowerCase();
    if (!t) return true;
    if (/^hydrological ingest incomplete\b/.test(t)) return true;
    if (/^wildfire layer signals sparse or unavailable\b/.test(t)) return true;
    if (/^no notable earthquake or flood\b/.test(t)) return true;
    if (/no earthquakes in m2\.5\+\b/.test(t)) return true;
    if (/no nasa viirs hotspots\b/.test(t)) return true;
    if (/^no inciweb wildfire rss items\b/.test(t)) return true;
    if (/firms json ok but no hotspot rows\b/.test(t)) return true;
    if (/csv parsed but no coordinate rows\b/.test(t)) return true;
    if (/\bno wfigs perimeter features\b/.test(t)) return true;
    if (/returned no features for this pull\b/.test(t)) return true;
    if (/interagency perimeter layer returned no features\b/.test(t)) return true;
    if (/empty window or outside current aoi\b/.test(t)) return true;
    return false;
}

/** Met findings bucketed for incident tabs (excludes earthquake — handled separately). */
const NWS_SURFACE_TABS: IncidentHistoryCategory[] = [
    'tornado',
    'storm',
    'hazardous',
    'coastal_surf',
    'marine',
];

function isKnownIncidentCategory(cat: string): cat is IncidentHistoryCategory {
    return (INCIDENT_HISTORY_TAB_KEYS as readonly string[]).includes(cat);
}

type HazardArchetype =
    | 'flood'
    | 'wildfire'
    | 'earthquake'
    | 'severe_weather'
    | 'multi'
    | 'baseline';

function distroCounts(report: RiskReport): {
    flood: number;
    wildfire: number;
    earthquake: number;
    tornado: number;
    storm: number;
    hazardous: number;
    coastal_surf: number;
    marine: number;
} {
    /** Sum counts across duplicate rows so totals match stacked bar-chart expectations. */
    const totals = {
        flood: 0,
        wildfire: 0,
        earthquake: 0,
        tornado: 0,
        storm: 0,
        hazardous: 0,
        coastal_surf: 0,
        marine: 0,
    };

    for (const row of report.incident_distribution ?? []) {
        const cat = String(row.category ?? '').trim().toLowerCase();
        if (!isKnownIncidentCategory(cat)) continue;
        const parsed = Number(row.count);
        const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
        totals[cat] += n;
    }

    return totals;
}

/** Incident types with strictly positive aggregated bar-chart count (single source for tabs + rollup). */
export function incidentCategoriesWithPositiveChartCount(report: RiskReport): IncidentHistoryCategory[] {
    const c = distroCounts(report);
    return INCIDENT_HISTORY_TAB_KEYS.filter((k) => (c[k] ?? 0) > 0);
}

/** Bar-chart rows with positive counts only; order matches {@link INCIDENT_HISTORY_TAB_KEYS}. */
export function incidentDistributionRowsAligned(report: RiskReport): DistroPoint[] {
    const c = distroCounts(report);
    return incidentCategoriesWithPositiveChartCount(report).map((category) => ({
        category,
        count: c[category] ?? 0,
    }));
}

/** Bar-chart / `incident_distribution` count — drives which historical subtabs appear. */
function distroCountForCategory(report: RiskReport, cat: IncidentHistoryCategory): number {
    return distroCounts(report)[cat];
}

function nwsSurfaceTotal(c: ReturnType<typeof distroCounts>): number {
    return Math.max(0, c.tornado + c.storm + c.hazardous + c.coastal_surf + c.marine);
}

function pickArchetype(report: RiskReport): HazardArchetype {
    const c = distroCounts(report);
    const met = nwsSurfaceTotal(c);
    const families = [
        c.flood > 0,
        c.wildfire > 0,
        c.earthquake > 0,
        met > 0,
    ].filter(Boolean).length;
    if (families >= 2) return 'multi';
    if (c.flood > 0) return 'flood';
    if (c.wildfire > 0) return 'wildfire';
    if (c.earthquake > 0) return 'earthquake';
    if (met > 0) return 'severe_weather';
    return 'baseline';
}

function matchConfidence(
    report: RiskReport,
    archetype: HazardArchetype | IncidentHistoryCategory,
    bundle: DashboardIngestBundle,
): number {
    const c = distroCounts(report);
    const n =
        c.flood +
        c.wildfire +
        c.earthquake +
        c.tornado +
        c.storm +
        c.hazardous +
        c.coastal_surf +
        c.marine;
    const major = report.major_incidents ?? 0;
    const feeds = bundle.successfulSources;
    if (archetype === 'baseline') {
        return Math.min(88, Math.round(52 + Math.min(24, feeds * 2.2)));
    }
    let base = 68 + Math.min(22, n * 3) + Math.min(8, major * 2) + Math.min(4, feeds);
    if ((report.alerts_count ?? 0) > 0 && major > 0) base += 4;
    return Math.min(96, Math.round(base));
}



export const INCIDENT_HISTORY_TAB_LABELS: Record<IncidentHistoryCategory, string> = {
    flood: 'Flood',
    tornado: 'Tornado',
    storm: 'Storm',
    hazardous: 'Hazardous',
    coastal_surf: 'Coastal surf',
    marine: 'Marine',
    wildfire: 'Wildfire',
    earthquake: 'Earthquake',
};

export function isLikelyEarthquakeBullet(text: string): boolean {
    const t = text.toLowerCase();
    if (/\bearthquake\b|\bseismic\b|\bepicenter\b|\baftershock\b/.test(t)) return true;
    if (/earthquake\s+magnitude|magnitude\s+m\d/i.test(text)) return true;
    return /^earthquake\s+magnitude\s+m/i.test(text.trim());
}

/** Classify meteorological ingest line to a surface tab (not earthquake — use {@link isLikelyEarthquakeBullet}). */
export function classifyMeteorologicalLineToTab(line: string): IncidentHistoryCategory | null {
    if (!line.trim()) return null;
    if (isLikelyEarthquakeBullet(line)) return null;
    if (isFloodRelatedEvent(line)) return 'flood';

    const b = classifyNwsIncidentDistributionBucket(line);
    if (b === 'tornado') return 'tornado';
    if (b === 'storm') return 'storm';
    if (b === 'hazardous') return 'hazardous';
    if (b === 'coastal_surf') return 'coastal_surf';
    if (b === 'marine') return 'marine';

    const t = line.toLowerCase();
    if (/\btornado\b|\btor\b/.test(t)) return 'tornado';
    if (/\bthunderstorm\b|\bhurricane\b|\btropical storm\b|\btropical depression\b|\bhail\b|\bsquall line\b/.test(t)) {
        return 'storm';
    }
    if (/\brip current\b|\bhigh surf\b|\bbeach hazards?\b|\bcoastal flood\b|\bsneaker wave\b/.test(t)) {
        return 'coastal_surf';
    }
    if (
        /\bgale warning\b|\bgale watch\b|\bsmall craft\b|\bmarine weather\b|\btsunami\b|\brough bar\b|\bheavy freezing spray\b/.test(
            t,
        ) ||
        (/\bmarine\b/.test(t) && !/\bmarine thunderstorm\b/.test(t))
    ) {
        return 'marine';
    }
    if (/\bwarning\b|\bwatch\b|\badvisory\b/.test(t)) return 'hazardous';
    return null;
}

function dedupePreserveOrder(xs: string[]): string[] {
    const seen = new Set<string>();
    return xs.filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
    });
}

/** Same buckets as {@link deriveEventBasedIncidentDistribution} / bar chart, from raw NWS GeoJSON. */
function nwsBriefLinesForCategory(bundle: DashboardIngestBundle, cat: IncidentHistoryCategory): string[] {
    const nws = bundle.sources.find((s) => s.source === 'NWS_FLOOD_ALERTS');
    if (!nws?.ok || !nws.data) return [];
    const feats = (nws.data as { features?: { properties?: Record<string, unknown> }[] })?.features;
    if (!Array.isArray(feats)) return [];
    const lines: string[] = [];
    for (const f of feats) {
        const p = f?.properties ?? {};
        const event = String(p.event ?? p.headline ?? '').trim();
        if (!event) continue;
        const area = String(p.areaDesc ?? '').trim();
        const sent = String(p.sent ?? p.effective ?? '').trim();
        const seg = [event, area, sent].filter(Boolean).join(' — ').trim();
        if (!seg || isNoiseIngestFindingLine(seg)) continue;

        if (cat === 'flood') {
            if (isFloodRelatedEvent(event)) lines.push(seg.slice(0, 520));
            continue;
        }
        if (isFloodRelatedEvent(event)) continue;
        const bucket = classifyNwsIncidentDistributionBucket(event);
        const match =
            (cat === 'tornado' && bucket === 'tornado') ||
            (cat === 'storm' && bucket === 'storm') ||
            (cat === 'hazardous' && bucket === 'hazardous') ||
            (cat === 'coastal_surf' && bucket === 'coastal_surf') ||
            (cat === 'marine' && bucket === 'marine');
        if (match) lines.push(seg.slice(0, 520));
    }
    return dedupePreserveOrder(lines).slice(0, 24);
}

function eqBriefLinesFromBundle(bundle: DashboardIngestBundle): string[] {
    const summary = bundle.sources.find((s) => s.source === 'USGS_EARTHQUAKES')?.summary;
    if (typeof summary !== 'string' || !summary.trim()) return [];
    const parts = summary
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length && !isNoiseIngestFindingLine(l));
    return dedupePreserveOrder(parts).slice(0, 24);
}

export function deriveRealtimeProceduresForIncident(
    report: RiskReport,
    cat: IncidentHistoryCategory,
    bundle?: DashboardIngestBundle | null,
): string[] {
    const metNoiseOk = (report.meteorological_findings ?? []).filter((l) => !isNoiseIngestFindingLine(l));

    const fromReport = (): string[] => {
        switch (cat) {
            case 'flood': {
                const hydro = (report.hydrological_findings ?? []).filter((l) => !isNoiseIngestFindingLine(l));
                const metFlood = metNoiseOk.filter((l) => !isLikelyEarthquakeBullet(l) && isFloodRelatedEvent(l));
                return dedupePreserveOrder([...hydro, ...metFlood]);
            }
            case 'wildfire':
                return (report.fire_findings ?? []).filter((l) => !isNoiseIngestFindingLine(l));
            case 'earthquake':
                return metNoiseOk.filter(isLikelyEarthquakeBullet);
            case 'tornado':
            case 'storm':
            case 'hazardous':
            case 'coastal_surf':
            case 'marine':
                return metNoiseOk.filter((l) => classifyMeteorologicalLineToTab(l) === cat);
            default:
                return [];
        }
    };

    const primary = fromReport();
    if (primary.length || !bundle) return primary;

    if (cat === 'flood' || NWS_SURFACE_TABS.includes(cat)) {
        const nws = nwsBriefLinesForCategory(bundle, cat);
        if (nws.length) return nws;
    }
    if (cat === 'earthquake') return eqBriefLinesFromBundle(bundle);
    return [];
}

function categoriesWithLiveFindings(
    report: RiskReport,
    bundle?: DashboardIngestBundle | null,
): IncidentHistoryCategory[] {
    return INCIDENT_HISTORY_TAB_KEYS.filter((k) => {
        if (distroCountForCategory(report, k) <= 0) return false;
        return deriveRealtimeProceduresForIncident(report, k, bundle).length > 0;
    });
}

function realtimePlaceholder(cat: IncidentHistoryCategory): string {
    switch (cat) {
        case 'flood':
            return 'No live hydrological findings in this ingest (USGS/NWPS/FEMA may be quiet or filtered for your scope).';
        case 'wildfire':
            return 'No live wildfire findings in this ingest (FIRMS/InciWeb/WFIGS may be sparse or unavailable).';
        case 'earthquake':
            return "No live seismic lines in this report's meteorological ingest for this pull.";
        case 'tornado':
        case 'storm':
        case 'hazardous':
        case 'coastal_surf':
        case 'marine':
            return `No live ${INCIDENT_HISTORY_TAB_LABELS[cat].toLowerCase()} lines in meteorological ingest for this pull.`;
        default:
            return 'No matching live findings for this category in this report.';
    }
}

function singleCategoryLiveProcedures(
    report: RiskReport,
    cat: IncidentHistoryCategory,
    bundle?: DashboardIngestBundle | null,
): string[] {
    const raw = deriveRealtimeProceduresForIncident(report, cat, bundle);
    if (raw.length) return raw;
    return [realtimePlaceholder(cat)];
}

function liveLineWithTabPrefix(cat: IncidentHistoryCategory, bullet: string): string {
    return `[${INCIDENT_HISTORY_TAB_LABELS[cat]}] ${bullet}`;
}

function buildRollupCurrentProcedures(
    report: RiskReport,
    archetype: HazardArchetype,
    bundle: DashboardIngestBundle,
): string[] {
    if (archetype === 'flood') return singleCategoryLiveProcedures(report, 'flood', bundle);
    if (archetype === 'wildfire') return singleCategoryLiveProcedures(report, 'wildfire', bundle);
    if (archetype === 'earthquake') return singleCategoryLiveProcedures(report, 'earthquake', bundle);

    if (archetype === 'severe_weather') {
        const tabs = NWS_SURFACE_TABS.filter((k) => {
            if (distroCountForCategory(report, k) <= 0) return false;
            return deriveRealtimeProceduresForIncident(report, k, bundle).length > 0;
        });
        if (!tabs.length) {
            return ['No live NWS / surface-hazard lines in meteorological ingest for this pull.'];
        }
        if (tabs.length === 1) return deriveRealtimeProceduresForIncident(report, tabs[0], bundle);
        const lines: string[] = [];
        for (const cat of tabs) {
            for (const bullet of deriveRealtimeProceduresForIncident(report, cat, bundle)) {
                lines.push(liveLineWithTabPrefix(cat, bullet));
            }
        }
        return dedupePreserveOrder(lines).slice(0, 28);
    }

    const liveCats = categoriesWithLiveFindings(report, bundle);
    const cats =
        archetype === 'multi'
            ? liveCats.length > 0
                ? liveCats
                : [...INCIDENT_HISTORY_TAB_KEYS]
            : [...INCIDENT_HISTORY_TAB_KEYS];

    const lines: string[] = [];
    for (const cat of cats) {
        if (distroCountForCategory(report, cat) <= 0) continue;
        const raw = deriveRealtimeProceduresForIncident(report, cat, bundle);
        if (!raw.length) continue;
        const prefixMulti = archetype === 'multi' || archetype === 'baseline' || cats.length > 1;
        for (const bullet of raw) {
            lines.push(prefixMulti ? liveLineWithTabPrefix(cat, bullet) : bullet);
        }
    }
    const trimmed = dedupePreserveOrder(lines).slice(0, 28);
    if (trimmed.length) return trimmed;
    return ['No category-specific live lines in this ingest — check upstream feeds or scope.'];
}

/** Prefer highest bar-chart count among categories that qualify for a historical subtab. */
export function pickDefaultHistoricalTab(
    report: RiskReport,
    bundle?: DashboardIngestBundle | null,
): IncidentHistoryCategory | null {
    const withLive = categoriesWithLiveFindings(report, bundle);
    if (!withLive.length) return null;
    const d = report.incident_distribution ?? [];
    const n = (cat: string) => Math.max(0, Math.floor(d.find((x) => x.category === cat)?.count ?? 0));
    return [...withLive].sort((a, b) => n(b) - n(a))[0] ?? withLive[0];
}

/**
 * Live-data-only historical scaffold. Supplies `current_procedures` (from live ingest)
 * and the computed `match_confidence` ONLY — no static playbook prose. The OpenAI pass
 * fills matched_event / similarity_summary / past_damages / past_procedures / future_measures.
 */
export function buildLiveHistoricalContext(
    bundle: DashboardIngestBundle,
    report: RiskReport,
): Pick<RiskReport, 'historical_analysis' | 'historical_analysis_by_incident'> {
    const archetype = pickArchetype(report);
    const historical_analysis: HistoricalAnalysis = {
        current_procedures: buildRollupCurrentProcedures(report, archetype, bundle),
        match_confidence: matchConfidence(report, archetype, bundle),
    };

    const byIncident: Partial<Record<IncidentHistoryCategory, HistoricalAnalysis>> = {};
    for (const cat of INCIDENT_HISTORY_TAB_KEYS) {
        if (distroCountForCategory(report, cat) <= 0) continue;
        const live = deriveRealtimeProceduresForIncident(report, cat, bundle);
        if (!live.length) continue;
        byIncident[cat] = {
            current_procedures: live,
            match_confidence: matchConfidence(report, cat, bundle),
        };
    }

    return {
        historical_analysis,
        historical_analysis_by_incident: Object.keys(byIncident).length ? byIncident : undefined,
    };
}

