/**
 * Event-based incident counts for AI Risk Assessment (flood/hydro + NWS met buckets + coastal/marine + wildfire + earthquake).
 * Aligns dedupe keys & level filters with AlertCommunication multi-sync where the same raw data exists.
 */

import type { AlertLevel } from '@/lib/normalization/types';
import type { DistroPoint, IncidentHistoryCategory } from '@/lib/types/risk-assessment';
import type { DashboardIngestBundle } from '@/lib/types/risk-assessment';
import { normalizeUSGS } from '@/lib/normalization/sources/normalize-usgs';
import { normalizeFIRMS } from '@/lib/normalization/sources/normalize-firms';
import type { USGSTimeSeries } from '@/lib/services/flood-service';
import { summarizeNwpsGauge } from '@/lib/services/nwps-reach-mapper';
import type { OpenFemaDisasterRecord } from '@/lib/services/openfema-service';
import type { FIRMSRecord } from '@/lib/services/wildfire-service';
import {
    classifyNwsIncidentDistributionBucket,
    isFloodRelatedEvent,
} from '@/lib/services/risk-ingest-service';
import { pickEarthquakeFeaturesForIngest } from '@/lib/services/risk-ingest-state-scope';

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
    const cap = stateCd.toLowerCase() === 'us' ? 25 : 15;
    return pickEarthquakeFeaturesForIngest(feats, stateCd, cap);
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

export interface IncidentEvidence {
    category: IncidentHistoryCategory;
    count: number;
    /** One human-readable line per deduped event: numbers, names, and timing preserved. */
    lines: string[];
}

/**
 * Single source of truth for both the bar chart counts AND the live evidence lines
 * shown under "Current Procedures" in the Historical Context tabs.
 * Count and lines are derived from the same dedupe logic so they can never diverge.
 */
export function deriveIncidentEvidence(bundle: DashboardIngestBundle): IncidentEvidence[] {
    // Maps from stable id → human-readable line (Map preserves insertion order)
    const flood = new Map<string, string>();
    const tornado = new Map<string, string>();
    const storm = new Map<string, string>();
    const hazardous = new Map<string, string>();
    const coastal_surf = new Map<string, string>();
    const marine = new Map<string, string>();
    const wildfire = new Map<string, string>();
    const earthquake = new Map<string, string>();

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
            if (!site) continue;
            const siteName = String((ts.sourceInfo as { siteName?: unknown })?.siteName ?? site);
            const stageRaw = (ts as { values?: { value?: { value?: unknown }[] }[] })?.values?.[0]?.value?.[0]?.value;
            const stagePart = stageRaw != null ? ` — stage ${stageRaw} ft` : '';
            flood.set(`usgs:${site}`, `${siteName}${stagePart} (USGS site ${site})`.slice(0, 520));
        }
    }

    const nwps = bundle.sources.find((s) => s.source === 'NOAA_NWPS_GAUGE');
    if (nwps?.ok && nwps.data) {
        const summary = summarizeNwpsGauge(bundle.nwpsGaugeId, nwps.data);
        if (summary) {
            const line = `${summary.placeLabel} — ${summary.cardTitle} — ${summary.detail}`.slice(0, 520);
            flood.set(`nwps:gauge:${bundle.nwpsGaugeId}`, line);
        }
    }

    const nws = bundle.sources.find((s) => s.source === 'NWS_FLOOD_ALERTS');
    if (nws?.ok && nws.data) {
        const feats = (nws.data as { features?: unknown[] })?.features;
        if (Array.isArray(feats)) {
            for (const f of feats) {
                const p = (f as { properties?: Record<string, unknown> })?.properties;
                if (!p) continue;
                const fid = nwsFeatureId(f as { properties?: Record<string, unknown> });
                const event = String(p.event ?? '').trim();
                const area = String(p.areaDesc ?? '').trim();
                const sent = String(p.sent ?? p.effective ?? '').trim();
                const line = [event, area, sent ? `sent ${sent}` : ''].filter(Boolean).join(' — ').slice(0, 520);
                if (isFloodRelatedEvent(event)) {
                    flood.set(fid, line);
                    continue;
                }
                const bucket = classifyNwsIncidentDistributionBucket(event);
                if (bucket === 'tornado') tornado.set(fid, line);
                else if (bucket === 'storm') storm.set(fid, line);
                else if (bucket === 'hazardous') hazardous.set(fid, line);
                else if (bucket === 'coastal_surf') coastal_surf.set(fid, line);
                else if (bucket === 'marine') marine.set(fid, line);
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
            for (const r of rows.slice(0, 12) as OpenFemaDisasterRecord[]) {
                const title = String(r.declarationTitle ?? 'FEMA Disaster').toUpperCase();
                const disNo = r.disasterNumber;
                const state = String(r.state ?? '');
                const line = `${title} — declaration #${disNo} — ${state}`.slice(0, 520);
                flood.set(femaExternalId(r), line);
            }
        }
    }

    const firms = bundle.sources.find((s) => s.source === 'NASA_FIRMS');
    if (firms?.ok) {
        const { records, csvFallbackCount } = collectFirmsRecords(firms.data, firms.signalCount);
        if (csvFallbackCount > 0) {
            for (let i = 0; i < csvFallbackCount; i++) wildfire.set(`firms-csv:${i}`, `FIRMS hotspot #${i + 1} (CSV feed)`);
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
                const bright = rec.brightness ? ` — brightness ${rec.brightness}` : '';
                const line = `FIRMS hotspot ${rec.latitude}, ${rec.longitude}${bright} (${rec.acq_date ?? ''})`.slice(0, 520);
                wildfire.set(firmsExternalId(rec), line);
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
            wildfire.set(`inciweb:${hashDjb2(lines[i]!)}`, lines[i]!.slice(0, 520));
        }
    }

    const arcgis = bundle.sources.find((s) => s.source === 'ESRI_ARCGIS_WFIGS');
    if (arcgis?.ok && arcgis.data) {
        const feats = (arcgis.data as { features?: { attributes?: Record<string, unknown> }[] })?.features;
        if (Array.isArray(feats)) {
            for (const f of feats) {
                const a = f?.attributes ?? {};
                const uid = a.UniqueFireIdentifier ?? a.OBJECTID ?? a.FIRE_ID;
                const nm = String(a.IncidentName ?? '');
                const id =
                    typeof uid === 'string' || typeof uid === 'number'
                        ? `wfigs:${uid}`
                        : nm.length
                          ? `wfigs:${nm}`
                          : null;
                if (!id) continue;
                const acres = a.GISAcres ?? a.DailyAcres;
                const contain = a.PercentContained;
                const parts = [nm || 'WFIGS fire', acres ? `${Number(acres).toFixed(0)} acres` : null, contain != null ? `${contain}% contained` : null];
                wildfire.set(id, parts.filter(Boolean).join(' — ').slice(0, 520));
            }
        }
    }

    const eq = bundle.sources.find((s) => s.source === 'USGS_EARTHQUAKES');
    if (eq?.ok && eq.data) {
        const feats = (eq.data as { features?: unknown[] })?.features ?? [];
        if (Array.isArray(feats) && feats.length) {
            for (const f of pickEarthquakeFeatures(feats, bundle.stateCd)) {
                const p = (f as { properties?: Record<string, unknown> })?.properties ?? {};
                const mag = typeof p.mag === 'number' ? p.mag.toFixed(1) : '?';
                const place = String(p.place ?? 'Unknown location');
                const t = typeof p.time === 'number' ? new Date(p.time).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
                const line = [`M${mag}`, place, t].filter(Boolean).join(' — ').slice(0, 520);
                earthquake.set(eqFeatureId(f), line);
            }
        }
    }

    const toEvidence = (category: IncidentHistoryCategory, m: Map<string, string>): IncidentEvidence =>
        ({ category, count: m.size, lines: [...m.values()] });

    return [
        toEvidence('flood', flood),
        toEvidence('tornado', tornado),
        toEvidence('storm', storm),
        toEvidence('hazardous', hazardous),
        toEvidence('coastal_surf', coastal_surf),
        toEvidence('marine', marine),
        toEvidence('wildfire', wildfire),
        toEvidence('earthquake', earthquake),
    ];
}

/**
 * Unique event counts from the current dashboard ingest bundle.
 * Thin wrapper over {@link deriveIncidentEvidence} — count and lines always match.
 */
export function deriveEventBasedIncidentDistribution(bundle: DashboardIngestBundle): DistroPoint[] {
    return deriveIncidentEvidence(bundle).map(({ category, count }) => ({ category, count }));
}

function hashDjb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return (h >>> 0).toString(36);
}
