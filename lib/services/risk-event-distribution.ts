/**
 * Event-based flood / wildfire / earthquake counts for AI Risk Assessment.
 * Aligns dedupe keys & level filters with AlertCommunication multi-sync where the same raw data exists.
 */

import type { AlertLevel } from '@/lib/normalization/types';
import type { DistroPoint } from '@/lib/types/risk-assessment';
import type { DashboardIngestBundle } from '@/lib/types/risk-assessment';
import { normalizeUSGS } from '@/lib/normalization/sources/normalize-usgs';
import { normalizeFIRMS } from '@/lib/normalization/sources/normalize-firms';
import type { USGSTimeSeries } from '@/lib/services/flood-service';
import { summarizeNwpsGauge } from '@/lib/services/nwps-reach-mapper';
import type { OpenFemaDisasterRecord } from '@/lib/services/openfema-service';
import type { FIRMSRecord } from '@/lib/services/wildfire-service';
import { isFloodRelatedEvent } from '@/lib/services/risk-ingest-service';

const FIRMS_CARD_CAP = (() => {
    const raw = process.env.FIRMS_MAX_CARDS;
    const n = raw ? parseFloat(raw) : NaN;
    const v = Number.isFinite(n) ? n : 150;
    return Math.max(1, Math.min(5000, Math.round(v)));
})();

function usgsAlertLevelsAllowed(): AlertLevel[] {
    if (process.env.USGS_SYNC_INCLUDE_NORMAL === 'false') {
        return ['watch', 'warning', 'emergency'];
    }
    return ['normal', 'watch', 'warning', 'emergency'];
}

function firmsAlertLevelsAllowed(): AlertLevel[] {
    if (process.env.FIRMS_SYNC_INCLUDE_NORMAL === 'false') {
        return ['watch', 'warning', 'emergency'];
    }
    return ['normal', 'watch', 'warning', 'emergency'];
}

function timeSeriesVariableCodes(ts: USGSTimeSeries): string[] {
    const vc = (ts as { variable?: { variableCode?: unknown } }).variable?.variableCode;
    if (Array.isArray(vc)) {
        return vc.map((x) => String((x as { value?: string })?.value ?? '')).filter(Boolean);
    }
    if (vc && typeof vc === 'object' && 'value' in (vc as object)) {
        return [String((vc as { value: string }).value)];
    }
    return [];
}

function firmsExternalId(record: FIRMSRecord): string {
    const lat = parseFloat(record.latitude).toFixed(4);
    const lon = parseFloat(record.longitude).toFixed(4);
    const date = (record.acq_date ?? '').replace(/[^0-9]/g, '');
    const time = (record.acq_time ?? '').replace(/[^0-9]/g, '').padStart(4, '0');
    return `firms:${lat}:${lon}:${date}${time}`;
}

function femaExternalId(r: OpenFemaDisasterRecord): string {
    if (r.id) return `fema:${r.id}`;
    return `fema:DR-${r.disasterNumber}-${(r.designatedArea ?? 'area').replace(/\s+/g, '-').slice(0, 80)}`;
}

function nwsFeatureId(f: { properties?: Record<string, unknown> }): string {
    const p = f.properties ?? {};
    const id = p.id ?? p['@id'];
    if (typeof id === 'string' && id.length) return `nws:${id}`;
    const ev = String(p.event ?? 'hydro');
    const ar = String(p.areaDesc ?? '');
    const sent = String(p.sent ?? p.effective ?? '');
    return `nws:${ev}:${ar}:${sent}`.slice(0, 240);
}

function collectFirmsRecords(
    data: unknown,
    signalCount: number | undefined
): { records: FIRMSRecord[]; csvFallbackCount: number } {
    if (!data) return { records: [], csvFallbackCount: 0 };
    if (typeof data === 'object' && data !== null && (data as { format?: string }).format === 'csv') {
        const n = Math.min(FIRMS_CARD_CAP, Math.max(0, signalCount ?? 0));
        return { records: [], csvFallbackCount: n };
    }
    const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { data?: unknown }).data)
          ? (data as { data: FIRMSRecord[] }).data
          : Array.isArray((data as { features?: unknown }).features)
            ? ((data as { features: FIRMSRecord[] }).features as FIRMSRecord[])
            : [];
    return { records: list.slice(0, FIRMS_CARD_CAP), csvFallbackCount: 0 };
}

function pickEarthquakeFeatures(feats: unknown[], stateCd: string): unknown[] {
    const stateToken = new RegExp(`\\b${stateCd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const inRoughUs = (lon: number, lat: number) => lon >= -170 && lon <= -60 && lat >= 15 && lat <= 72;
    const ranked = feats
        .map((f) => ({ f, p: (f as { properties?: Record<string, unknown> })?.properties ?? {}, c: (f as { geometry?: { coordinates?: number[] } })?.geometry?.coordinates as number[] }))
        .filter(({ c, p }) => Array.isArray(c) && c.length >= 2 && p?.mag != null)
        .sort((a, b) => (Number(b.p.mag) || 0) - (Number(a.p.mag) || 0));
    const usBox = ranked.filter(({ c }) => inRoughUs(c[0]!, c[1]!));
    const stateMatch = usBox.filter(({ p }) => stateToken.test(String(p.place ?? '')));
    const pick = (stateMatch.length ? stateMatch : usBox.length ? usBox : ranked).slice(0, 15);
    return pick.map(({ f }) => f);
}

function eqFeatureId(f: unknown): string {
    const p = (f as { properties?: Record<string, unknown> })?.properties ?? {};
    const id = p.id;
    if (typeof id === 'string' && id.length) return `usgs-eq:${id}`;
    const code = p.code;
    if (typeof code === 'string' && code.length) return `usgs-eq:${code}`;
    const t = p.time;
    const m = p.mag;
    return `usgs-eq:${t}:${m}:${String(p.place ?? '').slice(0, 80)}`;
}

/**
 * Unique event counts from the current dashboard ingest bundle (same raw payloads as `runDashboardIngest`).
 * Deduped by stable external-style keys aligned with AlertCommunication where applicable.
 */
export function deriveEventBasedIncidentDistribution(bundle: DashboardIngestBundle): DistroPoint[] {
    const floodIds = new Set<string>();
    const wildIds = new Set<string>();
    const eqIds = new Set<string>();

    const usgsAllowed = usgsAlertLevelsAllowed();
    const firmsAllowed = firmsAlertLevelsAllowed();

    const usgs = bundle.sources.find((s) => s.source === 'USGS_NWIS_IV');
    if (usgs?.ok && usgs.data) {
        const series = (usgs.data as { value?: { timeSeries?: USGSTimeSeries[] } })?.value?.timeSeries ?? [];
        for (const ts of series) {
            const codes = timeSeriesVariableCodes(ts);
            if (!codes.includes('00065')) continue;
            let events: ReturnType<typeof normalizeUSGS>;
            try {
                events = normalizeUSGS(ts);
            } catch {
                continue;
            }
            const ev = events[0];
            if (!ev || !usgsAllowed.includes(ev.alert_level)) continue;
            const site = ts.sourceInfo?.siteCode?.[0]?.value;
            if (site) floodIds.add(`usgs:${site}`);
        }
    }

    const nwps = bundle.sources.find((s) => s.source === 'NOAA_NWPS_GAUGE');
    if (nwps?.ok && nwps.data) {
        const summary = summarizeNwpsGauge(bundle.nwpsGaugeId, nwps.data);
        if (summary) floodIds.add(`nwps:gauge:${bundle.nwpsGaugeId}`);
    }

    const nws = bundle.sources.find((s) => s.source === 'NWS_FLOOD_ALERTS');
    if (nws?.ok && nws.data) {
        const feats = (nws.data as { features?: unknown[] })?.features;
        if (Array.isArray(feats)) {
            for (const f of feats) {
                const p = (f as { properties?: { event?: string } })?.properties;
                if (!p || !isFloodRelatedEvent(p.event)) continue;
                floodIds.add(nwsFeatureId(f as { properties?: Record<string, unknown> }));
            }
        }
    }

    const fema = bundle.sources.find((s) => s.source === 'FEMA_OPENFEMA');
    if (fema?.ok && fema.data) {
        const rows =
            (fema.data as { DisasterDeclarationsSummaries?: OpenFemaDisasterRecord[] }).DisasterDeclarationsSummaries ??
            (fema.data as { value?: OpenFemaDisasterRecord[] }).value ??
            [];
        if (Array.isArray(rows)) {
            for (const r of rows.slice(0, 12)) {
                floodIds.add(femaExternalId(r as OpenFemaDisasterRecord));
            }
        }
    }

    const firms = bundle.sources.find((s) => s.source === 'NASA_FIRMS');
    if (firms?.ok) {
        const { records, csvFallbackCount } = collectFirmsRecords(firms.data, firms.signalCount);
        if (csvFallbackCount > 0) {
            for (let i = 0; i < csvFallbackCount; i++) wildIds.add(`firms-csv:${i}`);
        } else {
            const sorted = [...records].sort(
                (a, b) => parseFloat(b.brightness ?? '0') - parseFloat(a.brightness ?? '0')
            );
            for (const rec of sorted) {
                let events: ReturnType<typeof normalizeFIRMS>;
                try {
                    events = normalizeFIRMS(rec);
                } catch {
                    continue;
                }
                const ev = events[0];
                if (!ev || !firmsAllowed.includes(ev.alert_level)) continue;
                wildIds.add(firmsExternalId(rec));
            }
        }
    }

    const inci = bundle.sources.find((s) => s.source === 'INCIWEB_RSS');
    if (inci?.ok && inci.summary) {
        const lines = inci.summary
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !/^no rss items parsed/i.test(l));
        for (let i = 0; i < lines.length; i++) {
            wildIds.add(`inciweb:${hashDjb2(lines[i]!)}`);
        }
    }

    const arcgis = bundle.sources.find((s) => s.source === 'ESRI_ARCGIS_WFIGS');
    if (arcgis?.ok && arcgis.data) {
        const feats = (arcgis.data as { features?: { attributes?: Record<string, unknown> }[] })?.features;
        if (Array.isArray(feats)) {
            for (const f of feats) {
                const a = f?.attributes ?? {};
                const uid = a.UniqueFireIdentifier ?? a.OBJECTID ?? a.FIRE_ID;
                const nm = a.IncidentName;
                const id =
                    typeof uid === 'string' || typeof uid === 'number'
                        ? `wfigs:${uid}`
                        : typeof nm === 'string' && nm.length
                          ? `wfigs:${nm}`
                          : null;
                if (id) wildIds.add(id);
            }
        }
    }

    const eq = bundle.sources.find((s) => s.source === 'USGS_EARTHQUAKES');
    if (eq?.ok && eq.data) {
        const feats = (eq.data as { features?: unknown[] })?.features ?? [];
        if (Array.isArray(feats) && feats.length) {
            for (const f of pickEarthquakeFeatures(feats, bundle.stateCd)) {
                eqIds.add(eqFeatureId(f));
            }
        }
    }

    return [
        { category: 'flood', count: floodIds.size },
        { category: 'wildfire', count: wildIds.size },
        { category: 'earthquake', count: eqIds.size },
    ];
}

function hashDjb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
}
