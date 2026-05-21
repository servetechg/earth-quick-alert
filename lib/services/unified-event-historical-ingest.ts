/**
 * Backfill `unifiedevents` with `dataStatus: 'past'` from external APIs that expose historical windows.
 * Live sync remains authoritative for `current` rows (historical upserts skip existing current docs).
 */

import { formatDistanceToNow } from 'date-fns';
import { getFIRMSData, type FIRMSRecord } from '@/lib/services/wildfire-service';
import { getUSGSData, type USGSTimeSeries } from '@/lib/services/flood-service';
import { normalizeFIRMS } from '@/lib/normalization/sources/normalize-firms';
import { normalizeUSGS } from '@/lib/normalization/sources/normalize-usgs';
import { FIRMS_DEFAULT_BBOX } from '@/lib/services/wildfire-service';
import { DEFAULT_USGS_SITES_NATIONWIDE } from '@/lib/constants/nationwide-alert-feed-defaults';
import { buildUnifiedEventFromFemaRecord } from '@/lib/unified-event/build-from-fema';
import {
    fetchFemaWebSummaryByDisasterNumber,
    fetchOpenFemaDisastersPast3Months,
} from '@/lib/services/openfema-service';
import { buildUnifiedEventFromEarthquakeFeature } from '@/lib/unified-event/build-from-earthquake';
import { buildUnifiedEventFromMappedDoc } from '@/lib/unified-event/build-from-mapped';
import {
    upsertHistoricalUnifiedEvents,
    type HistoricalUpsertStats,
} from '@/lib/unified-event/repository';
import {
    fetchUsgsEarthquakeFeatures,
    usgsEarthquakePast3MonthsWindow,
} from '@/lib/services/usgs-earthquake-fdsnws';

const DATA_FRESH_MS = 24 * 60 * 60 * 1000;

export type HistoricalSourceReport = HistoricalUpsertStats & { error?: string };

export type HistoricalIngestReport = {
    fema?: HistoricalSourceReport;
    earthquake?: HistoricalSourceReport;
    firms?: HistoricalSourceReport;
    usgs?: HistoricalSourceReport;
};

function historicalEnabled(): boolean {
    return process.env.UNIFIED_EVENT_HISTORICAL_ENABLED !== 'false';
}

function parseDaysEnv(name: string, fallback: number, max: number): number {
    const n = parseInt(process.env[name] ?? `${fallback}`, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(max, n));
}

function sinceIsoDate(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

function isObservationStale(isoOrEpoch: string | number): boolean {
    const t = typeof isoOrEpoch === 'number' ? isoOrEpoch : new Date(isoOrEpoch).getTime();
    if (!Number.isFinite(t)) return true;
    return Date.now() - t >= DATA_FRESH_MS;
}

async function runSafe(
    label: string,
    fn: () => Promise<HistoricalSourceReport>,
): Promise<HistoricalSourceReport> {
    try {
        return await fn();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[unified-historical:${label}]`, message);
        return { upserted: 0, skippedCurrent: 0, error: message };
    }
}

/** FEMA OpenFEMA — past 3 months declarations + v1 web financial summaries. */
export async function ingestHistoricalFema(): Promise<HistoricalSourceReport> {
    const [declarations, webMap] = await Promise.all([
        fetchOpenFemaDisastersPast3Months(),
        fetchFemaWebSummaryByDisasterNumber(),
    ]);
    const events = declarations.map((d) =>
        buildUnifiedEventFromFemaRecord(
            d,
            d.disasterNumber != null ? webMap.get(d.disasterNumber) : undefined,
        ),
    );
    return upsertHistoricalUnifiedEvents(events);
}

/** USGS FDSNWS — earthquakes in date range (USA bbox, paginated, min M2.5). Default: past 3 months. */
export async function ingestHistoricalEarthquakes(): Promise<HistoricalSourceReport> {
    const days = parseDaysEnv('UNIFIED_EVENT_HISTORICAL_EQ_DAYS', 90, 365 * 25);
    const minMag = parseFloat(process.env.UNIFIED_EVENT_HISTORICAL_EQ_MIN_MAG ?? '2.5');
    const maxEvents = Math.max(
        0,
        parseInt(process.env.UNIFIED_EVENT_HISTORICAL_EQ_LIMIT ?? '0', 10) || 0,
    );

    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    const features = await fetchUsgsEarthquakeFeatures({
        startTime: start,
        endTime: end,
        minMagnitude: Number.isFinite(minMag) ? minMag : 2.5,
        maxEvents,
    });

    const events = [];
    for (const f of features) {
        const ev = buildUnifiedEventFromEarthquakeFeature(f);
        if (ev) events.push(ev);
    }
    return upsertHistoricalUnifiedEvents(events);
}

/** Live FDSNWS fetch → DB (earthquake JSON export already seeded). */
export async function seedEarthquakesPast3MonthsFromApi(): Promise<HistoricalSourceReport> {
    const minMag = parseFloat(process.env.UNIFIED_EVENT_HISTORICAL_EQ_MIN_MAG ?? '2.5');
    const maxEvents = Math.max(
        0,
        parseInt(process.env.UNIFIED_EVENT_HISTORICAL_EQ_LIMIT ?? '0', 10) || 0,
    );
    const { start, end } = usgsEarthquakePast3MonthsWindow();

    const features = await fetchUsgsEarthquakeFeatures({
        startTime: start,
        endTime: end,
        minMagnitude: Number.isFinite(minMag) ? minMag : 2.5,
        maxEvents,
    });

    const events = [];
    for (const f of features) {
        const ev = buildUnifiedEventFromEarthquakeFeature(f);
        if (ev) events.push(ev);
    }

    return upsertHistoricalUnifiedEvents(events);
}

function parseFirmsAcqMs(record: FIRMSRecord): number {
    const d = (record.acq_date ?? '').replace(/-/g, '');
    const t = (record.acq_time ?? '').replace(/[^0-9]/g, '').padStart(4, '0');
    if (d.length < 8) return NaN;
    const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`;
    return new Date(iso).getTime();
}

/** NASA FIRMS — up to 5 days of hotspots; only stale acquisitions are stored as past. */
export async function ingestHistoricalFirms(): Promise<HistoricalSourceReport> {
    const days = parseDaysEnv('UNIFIED_EVENT_HISTORICAL_FIRMS_DAYS', 5, 5);
    const bbox = process.env.FIRMS_BBOX?.trim() || FIRMS_DEFAULT_BBOX;
    const source = process.env.FIRMS_SOURCE?.trim() || 'VIIRS_SNPP_NRT';
    const maxCards = Math.min(2000, Math.max(50, parseInt(process.env.UNIFIED_EVENT_HISTORICAL_FIRMS_MAX ?? '400', 10)));

    const records = await getFIRMSData(bbox, days, source);
    const sorted = [...records].sort(
        (a, b) => parseFloat(b.brightness ?? '0') - parseFloat(a.brightness ?? '0'),
    );

    const events = [];
    for (const record of sorted.slice(0, maxCards)) {
        const acqMs = parseFirmsAcqMs(record);
        if (!isObservationStale(acqMs)) continue;

        const normalized = normalizeFIRMS(record);
        const event = normalized[0];
        if (!event) continue;

        const lat = parseFloat(record.latitude);
        const lon = parseFloat(record.longitude);
        const frp = parseFloat(record.frp ?? '');
        const brightness = parseFloat(record.brightness ?? '');

        const extId = `firms:${parseFloat(record.latitude).toFixed(4)}:${parseFloat(record.longitude).toFixed(4)}:${(record.acq_date ?? '').replace(/[^0-9]/g, '')}${(record.acq_time ?? '').replace(/[^0-9]/g, '').padStart(4, '0')}`;

        events.push(
            buildUnifiedEventFromMappedDoc('firms', {
                externalId: extId,
                name: 'Wildfire Watch',
                type: 'Watch',
                iconType: 'lightning',
                location: `Hotspot near ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
                issuedAt: formatDistanceToNow(new Date(acqMs), { addSuffix: true }),
                expiresAt: 'See FIRMS',
                status: 'Monitor',
                description: event.description,
                severity: brightness >= 330 ? 'High' : 'Moderate',
                lat,
                lng,
                properties: {
                    wildfire: {
                        intensity: Number.isFinite(frp)
                            ? { metric: 'frp', value: frp, unit: 'MW', display: `${frp} MW` }
                            : Number.isFinite(brightness)
                              ? {
                                    metric: 'brightness',
                                    value: brightness,
                                    unit: 'K',
                                    display: `${brightness} K`,
                                }
                              : null,
                        frp: Number.isFinite(frp) ? frp : null,
                        brightnessTi4: Number.isFinite(brightness) ? brightness : null,
                        acquiredAt: Number.isFinite(acqMs) ? new Date(acqMs).toISOString() : null,
                        firmsConfidence: record.confidence ?? null,
                    },
                },
            }),
        );
    }

    return upsertHistoricalUnifiedEvents(events);
}

function usgsSiteCode(series: USGSTimeSeries): string | null {
    return series.sourceInfo.siteCode?.[0]?.value ?? null;
}

function latestValueInSeries(series: USGSTimeSeries): { value: number; dateTime: string } | null {
    const values = series.values?.[0]?.value;
    if (!values?.length) return null;
    let best = values[values.length - 1];
    for (const v of values) {
        if (v.dateTime > best.dateTime) best = v;
    }
    const num = parseFloat(best.value);
    if (!Number.isFinite(num)) return null;
    return { value: num, dateTime: best.dateTime };
}

/** USGS NWIS IV — P7D (configurable) gauge readings; past observations only. */
export async function ingestHistoricalUsgsGauges(): Promise<HistoricalSourceReport> {
    const period = process.env.UNIFIED_EVENT_HISTORICAL_USGS_PERIOD?.trim() || 'P7D';
    const sitesRaw = process.env.USGS_SITES?.trim() || process.env.RISK_USGS_SITES?.trim();
    const sites = sitesRaw
        ? sitesRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : [...DEFAULT_USGS_SITES_NATIONWIDE];

    const seriesList = await getUSGSData(sites, '00060,00065', period);
    const events = [];

    for (const series of seriesList) {
        const siteCode = usgsSiteCode(series);
        if (!siteCode) continue;

        const latest = latestValueInSeries(series);
        if (!latest || !isObservationStale(latest.dateTime)) continue;

        const normalized = normalizeUSGS(series);
        const event = normalized[0];
        if (!event) continue;

        const lat = series.sourceInfo.geoLocation?.geogLocation?.latitude;
        const lon = series.sourceInfo.geoLocation?.geogLocation?.longitude;
        const siteName = series.sourceInfo.siteName?.trim() || 'USGS gauge';
        const obsDay = latest.dateTime.slice(0, 10);

        events.push(
            buildUnifiedEventFromMappedDoc('usgs', {
                externalId: `usgs:${siteCode}:hist:${obsDay}`,
                name: 'Flood Watch',
                type: 'Watch',
                iconType: 'cloud',
                location: siteName,
                issuedAt: formatDistanceToNow(new Date(latest.dateTime), { addSuffix: true }),
                expiresAt: 'See USGS NWIS',
                status: 'Monitor',
                description: `${event.description} (observed ${latest.dateTime})`,
                severity: event.severity_score >= 75 ? 'High' : 'Moderate',
                lat: Number.isFinite(lat) ? lat : null,
                lng: Number.isFinite(lon) ? lon : null,
                properties: {
                    flood: {
                        intensity: {
                            metric: 'gage_height',
                            value: latest.value,
                            unit: 'ft',
                            display: `${latest.value} ft`,
                        },
                        gageHeight: latest.value,
                        gaugeUsgsId: siteCode,
                        observedAt: latest.dateTime,
                    },
                },
            }),
        );
    }

    return upsertHistoricalUnifiedEvents(events);
}

/** Pull all configured historical sources into `unifiedevents` as `past`. */
export async function syncAllHistoricalUnifiedEvents(): Promise<HistoricalIngestReport> {
    if (!historicalEnabled()) {
        return {};
    }

    const [fema, earthquake, firms, usgs] = await Promise.all([
        process.env.UNIFIED_EVENT_HISTORICAL_FEMA_ENABLED === 'false'
            ? Promise.resolve({ upserted: 0, skippedCurrent: 0 })
            : runSafe('fema', ingestHistoricalFema),
        process.env.UNIFIED_EVENT_HISTORICAL_EQ_ENABLED === 'false'
            ? Promise.resolve({ upserted: 0, skippedCurrent: 0 })
            : runSafe('earthquake', ingestHistoricalEarthquakes),
        process.env.UNIFIED_EVENT_HISTORICAL_FIRMS_ENABLED === 'false'
            ? Promise.resolve({ upserted: 0, skippedCurrent: 0 })
            : runSafe('firms', ingestHistoricalFirms),
        process.env.UNIFIED_EVENT_HISTORICAL_USGS_ENABLED === 'false'
            ? Promise.resolve({ upserted: 0, skippedCurrent: 0 })
            : runSafe('usgs', ingestHistoricalUsgsGauges),
    ]);

    return { fema, earthquake, firms, usgs };
}

let lastHistoricalSyncMs = 0;
const DEFAULT_HISTORICAL_INTERVAL_MS = 60 * 60 * 1000;

/** Throttled historical backfill (runs after live sync on feed gate). */
export async function syncHistoricalUnifiedEventsIfStale(): Promise<HistoricalIngestReport | null> {
    if (!historicalEnabled()) return null;

    const minMs = parseInt(
        process.env.UNIFIED_EVENT_HISTORICAL_MIN_INTERVAL_MS ?? `${DEFAULT_HISTORICAL_INTERVAL_MS}`,
        10,
    );
    const now = Date.now();
    if (now - lastHistoricalSyncMs < minMs) return null;

    lastHistoricalSyncMs = now;
    try {
        return await syncAllHistoricalUnifiedEvents();
    } catch (err) {
        console.error('[unified-historical]', err);
        lastHistoricalSyncMs = 0;
        return null;
    }
}
