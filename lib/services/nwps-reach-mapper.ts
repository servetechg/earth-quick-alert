/**
 * Map NOAA NWPS reach streamflow / gauge JSON into a short human summary for AlertCommunication.
 * Response shape varies; v1 `/gauges/{lid}` uses nested `status.observed` (see api.water.noaa.gov).
 */

export interface NwpsMappedSummary {
    /** Short card title — aligned with USGS flood cards (e.g. Flood Watch). */
    cardTitle: string;
    /** Location line — river / reach, USGS-style (ALL CAPS, state when known). */
    placeLabel: string;
    detail: string;
    severityHint: 'Moderate' | 'High' | 'Extreme';
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function readStateAbbr(raw: Record<string, unknown>): string | undefined {
    const state = raw.state;
    if (isRecord(state) && typeof state.abbreviation === 'string') {
        return state.abbreviation;
    }
    return undefined;
}

function extractNwpsObserved(raw: Record<string, unknown>): Record<string, unknown> | null {
    const status = raw.status;
    if (isRecord(status) && isRecord(status.observed)) {
        return status.observed as Record<string, unknown>;
    }
    return null;
}

function primaryFloodCategory(raw: Record<string, unknown>): string {
    const obs = extractNwpsObserved(raw);
    if (obs && typeof obs.floodCategory === 'string') {
        return obs.floodCategory;
    }
    const top = raw.ObservedFloodCategory ?? raw.floodCategory ?? raw.flood_category;
    if (typeof top === 'string') return top;
    return '';
}

function nwpsCategoryKey(fc: string): string {
    return fc.toLowerCase().replace(/-/g, '_');
}

function nwpsCategoryToCardTitle(fc: string): string {
    const c = nwpsCategoryKey(fc);
    if (/major|record/.test(c)) return 'Flood Warning';
    if (/moderate/.test(c)) return 'Flood Warning';
    if (/minor/.test(c)) return 'Flood Watch';
    if (/action/.test(c)) return 'Flood Watch';
    if (/no_flooding|not_current|fcst_not|below|unknown/.test(c) || c === '') return 'Flood Watch';
    return 'Flood Watch';
}

function severityFromNwpsCategory(fc: string): NwpsMappedSummary['severityHint'] {
    const c = nwpsCategoryKey(fc);
    if (/major|record/.test(c)) return 'Extreme';
    if (/moderate/.test(c)) return 'High';
    if (/minor|action/.test(c)) return 'High';
    return 'Moderate';
}

export function formatNwpsPlaceLine(raw: Record<string, unknown>, fallbackId: string): string {
    const river =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (typeof raw.reachName === 'string' && raw.reachName.trim());
    if (river) {
        const st = readStateAbbr(raw);
        const upper = river.toUpperCase();
        if (st) return `${upper}, ${st}`;
        const county = typeof raw.county === 'string' ? raw.county.trim() : '';
        if (county) return `${upper} (${county})`;
        return upper;
    }
    return `${String(fallbackId).toUpperCase()} (NWPS reach)`;
}

function buildGaugeDetailV1(raw: Record<string, unknown>): string | null {
    const parts: string[] = [];
    const obs = extractNwpsObserved(raw);
    if (!obs) return null;

    const primary = obs.primary;
    const pu = obs.primaryUnit;
    if (typeof primary === 'number' && primary > -900 && typeof pu === 'string' && pu) {
        parts.push(`Stage: ${primary} ${pu}`);
    }
    const sec = obs.secondary;
    const su = obs.secondaryUnit;
    if (typeof sec === 'number' && sec > 0 && typeof su === 'string' && su) {
        parts.push(`Flow: ${sec} ${su}`);
    }
    const fc = obs.floodCategory;
    if (typeof fc === 'string' && fc) {
        parts.push(`Flood category: ${fc.replace(/_/g, ' ')}`);
    }
    const vt = obs.validTime;
    if (typeof vt === 'string' && vt && !vt.startsWith('0001-01-01')) {
        parts.push(`Observed: ${vt}`);
    }
    if (parts.length === 0) return null;
    return parts.join(' · ');
}

export function summarizeNwpsStreamflow(reachId: string, raw: unknown): NwpsMappedSummary | null {
    if (!isRecord(raw)) return null;

    if (typeof raw.code === 'number' && raw.message) {
        return null;
    }

    const parts: string[] = [];

    const status = raw.status;
    if (typeof status === 'string') parts.push(`Status: ${status}`);

    const floodCategory =
        primaryFloodCategory(raw) ||
        (typeof raw.floodCategory === 'string' ? raw.floodCategory : '') ||
        (typeof raw.flood_category === 'string' ? raw.flood_category : '');
    if (floodCategory && !primaryFloodCategory(raw)) {
        parts.push(`Flood category: ${floodCategory}`);
    }

    const stage = raw.observedStage ?? raw.stage ?? raw.latestStage;
    if (stage !== undefined && stage !== null) {
        parts.push(`Stage: ${String(stage)}`);
    }

    const flow = raw.observedFlow ?? raw.flow ?? raw.streamflow;
    if (flow !== undefined && flow !== null) {
        parts.push(`Flow: ${String(flow)}`);
    }

    const v1Detail = buildGaugeDetailV1(raw);
    const detail =
        v1Detail ||
        (parts.length > 0
            ? parts.join(' · ')
            : 'Latest NWPS streamflow snapshot (see raw metadata in national dashboard tools).');

    return {
        cardTitle: nwpsCategoryToCardTitle(floodCategory),
        placeLabel: formatNwpsPlaceLine(raw, reachId),
        detail,
        severityHint: severityFromNwpsCategory(floodCategory),
    };
}

/**
 * Map NWPS `/gauges/{lid}` JSON into a short summary (LID-based gauges).
 */
export function summarizeNwpsGauge(lid: string, raw: unknown): NwpsMappedSummary | null {
    if (!isRecord(raw)) return null;

    if (typeof raw.code === 'number' && raw.message) {
        return null;
    }

    const legacyParts: string[] = [];

    const statusTop = raw.status;
    if (typeof statusTop === 'string') {
        legacyParts.push(`Status: ${statusTop}`);
    }

    const flatFc = raw.floodCategory ?? raw.flood_category;
    if (typeof flatFc === 'string') {
        legacyParts.push(`Flood category: ${flatFc}`);
    }

    const observed = raw.observed;
    if (isRecord(observed) && !extractNwpsObserved(raw)) {
        const st = observed.stage ?? observed.latestStage ?? observed.observedStage;
        if (st !== undefined && st !== null) legacyParts.push(`Stage: ${String(st)}`);
        const fl = observed.flow ?? observed.streamflow;
        if (fl !== undefined && fl !== null) legacyParts.push(`Flow: ${String(fl)}`);
    }

    const stage = raw.observedStage ?? raw.stage ?? raw.latestStage;
    if (stage !== undefined && stage !== null && !legacyParts.some((p) => p.startsWith('Stage:'))) {
        legacyParts.push(`Stage: ${String(stage)}`);
    }

    const flow = raw.observedFlow ?? raw.flow ?? raw.streamflow;
    if (flow !== undefined && flow !== null && !legacyParts.some((p) => p.startsWith('Flow:'))) {
        legacyParts.push(`Flow: ${String(flow)}`);
    }

    const fc = primaryFloodCategory(raw);
    const v1Detail = buildGaugeDetailV1(raw);
    const detail =
        v1Detail ||
        (legacyParts.length > 0 ? legacyParts.join(' · ') : 'Latest NWPS gauge snapshot.');

    return {
        cardTitle: nwpsCategoryToCardTitle(fc),
        placeLabel: formatNwpsPlaceLine(raw, lid),
        detail,
        severityHint: severityFromNwpsCategory(fc),
    };
}
