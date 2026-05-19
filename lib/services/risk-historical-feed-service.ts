/**
 * Fetches real historical hazard events from live public APIs for use as PAST_DATA
 * in the AI risk assessment. OpenAI receives the full structured event data and
 * intelligently extracts statistics / formats the analysis.
 *
 * Sources:
 *   - earthquake      → USGS ANSS ComCat archive
 *   - flood, wildfire → FEMA OpenFEMA DisasterDeclarationsSummaries + FemaWebDisasterSummaries
 *   - tornado, storm, hazardous, coastal_surf, marine → NOAA NCEI Storm Events (per-year CSV, cached)
 */

import zlib from 'zlib';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { IncidentHistoryCategory, PastHazardEvent } from '@/lib/types/risk-assessment';
import type { CurrentHazardProfile } from '@/lib/risk-assessment/extract-current-hazard-profile';

export interface HistoricalHazardEvents {
    by_incident: Partial<Record<IncidentHistoryCategory, PastHazardEvent[]>>;
    fetchedAt: string;
    sourceStatus: { source: string; ok: boolean; error?: string }[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const HIST_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, opts?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), HIST_FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

function friendlyDate(epochMs: number): string {
    const d = new Date(epochMs);
    if (isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function isoToFriendly(isoStr: string): string {
    if (!isoStr) return 'Unknown date';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// State bounding boxes (minLat, maxLat, minLon, maxLon) for USGS geo filter
// ---------------------------------------------------------------------------

const STATE_BBOX: Record<string, [number, number, number, number]> = {
    AL: [30.14, 35.01, -88.47, -84.88], AK: [51.21, 71.41, -179.15, -129.97],
    AZ: [31.33, 37.00, -114.82, -109.04], AR: [33.00, 36.50, -94.62, -89.64],
    CA: [32.53, 42.01, -124.42, -114.13], CO: [36.99, 41.00, -109.06, -102.04],
    CT: [40.97, 42.05, -73.73, -71.79], DE: [38.45, 39.84, -75.79, -74.98],
    FL: [24.54, 31.00, -87.63, -80.03], GA: [30.35, 35.00, -85.61, -80.84],
    HI: [18.91, 22.24, -160.25, -154.80], ID: [41.99, 49.00, -117.24, -111.04],
    IL: [36.97, 42.51, -91.51, -87.02], IN: [37.77, 41.76, -88.10, -84.78],
    IA: [40.37, 43.50, -96.64, -90.14], KS: [36.99, 40.00, -102.05, -94.59],
    KY: [36.50, 39.15, -89.57, -81.96], LA: [28.93, 33.02, -94.04, -88.82],
    ME: [43.06, 47.46, -71.08, -66.95], MD: [37.91, 39.72, -79.49, -74.99],
    MA: [41.24, 42.89, -73.51, -69.93], MI: [41.70, 48.31, -90.42, -82.41],
    MN: [43.50, 49.38, -97.24, -89.49], MS: [30.17, 35.00, -91.65, -88.10],
    MO: [35.99, 40.61, -95.77, -89.10], MT: [44.36, 49.00, -116.05, -104.04],
    NE: [40.00, 43.00, -104.05, -95.31], NV: [35.00, 42.00, -120.01, -114.04],
    NH: [42.70, 45.31, -72.56, -70.61], NJ: [38.92, 41.36, -75.56, -73.89],
    NM: [31.33, 37.00, -109.05, -103.00], NY: [40.50, 45.02, -79.77, -71.86],
    NC: [33.84, 36.59, -84.32, -75.46], ND: [45.93, 49.00, -104.05, -96.56],
    OH: [38.40, 42.00, -84.82, -80.52], OK: [33.62, 37.00, -103.00, -94.43],
    OR: [41.99, 46.24, -124.57, -116.46], PA: [39.72, 42.27, -80.52, -74.69],
    RI: [41.15, 42.02, -71.91, -71.12], SC: [32.05, 35.22, -83.36, -78.55],
    SD: [42.48, 45.94, -104.06, -96.44], TN: [34.98, 36.68, -90.31, -81.65],
    TX: [25.84, 36.50, -106.65, -93.51], UT: [36.99, 42.00, -114.05, -109.04],
    VT: [42.73, 45.02, -73.44, -71.46], VA: [36.54, 39.46, -83.68, -75.24],
    WA: [45.54, 49.00, -124.73, -116.92], WV: [37.20, 40.64, -82.64, -77.72],
    WI: [42.49, 47.08, -92.89, -86.25], WY: [40.99, 45.01, -111.06, -104.05],
    DC: [38.79, 38.99, -77.12, -76.91], PR: [17.92, 18.52, -67.27, -65.59],
};

const STATE_ABBR_TO_NAME: Record<string, string> = {
    AL: 'ALABAMA', AK: 'ALASKA', AZ: 'ARIZONA', AR: 'ARKANSAS', CA: 'CALIFORNIA',
    CO: 'COLORADO', CT: 'CONNECTICUT', DE: 'DELAWARE', FL: 'FLORIDA', GA: 'GEORGIA',
    HI: 'HAWAII', ID: 'IDAHO', IL: 'ILLINOIS', IN: 'INDIANA', IA: 'IOWA',
    KS: 'KANSAS', KY: 'KENTUCKY', LA: 'LOUISIANA', ME: 'MAINE', MD: 'MARYLAND',
    MA: 'MASSACHUSETTS', MI: 'MICHIGAN', MN: 'MINNESOTA', MS: 'MISSISSIPPI',
    MO: 'MISSOURI', MT: 'MONTANA', NE: 'NEBRASKA', NV: 'NEVADA', NH: 'NEW HAMPSHIRE',
    NJ: 'NEW JERSEY', NM: 'NEW MEXICO', NY: 'NEW YORK', NC: 'NORTH CAROLINA',
    ND: 'NORTH DAKOTA', OH: 'OHIO', OK: 'OKLAHOMA', OR: 'OREGON', PA: 'PENNSYLVANIA',
    RI: 'RHODE ISLAND', SC: 'SOUTH CAROLINA', SD: 'SOUTH DAKOTA', TN: 'TENNESSEE',
    TX: 'TEXAS', UT: 'UTAH', VT: 'VERMONT', VA: 'VIRGINIA', WA: 'WASHINGTON',
    WV: 'WEST VIRGINIA', WI: 'WISCONSIN', WY: 'WYOMING', DC: 'DISTRICT OF COLUMBIA',
    PR: 'PUERTO RICO', VI: 'VIRGIN ISLANDS', GU: 'GUAM',
};

// ---------------------------------------------------------------------------
// USGS earthquake archive
// ---------------------------------------------------------------------------

const USGS_COMCAT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

async function fetchUsgsEarthquakePastEvents(
    profile: CurrentHazardProfile,
): Promise<PastHazardEvent[]> {
    const mag = profile.earthquakeMaxMagnitude;
    const minMag = mag != null ? Math.max(2.5, mag - 0.7) : 5.0;
    const maxMag = mag != null ? Math.min(10, mag + 0.7) : 9.9;

    const endTime = new Date().toISOString().slice(0, 10);
    const startTime = new Date(Date.now() - 25 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const params = new URLSearchParams({
        format: 'geojson',
        orderby: 'time',
        limit: '20',
        minmagnitude: String(minMag),
        maxmagnitude: String(maxMag),
        starttime: startTime,
        endtime: endTime,
    });

    // Geographic scope for state queries
    if (profile.scope === 'state' && profile.stateCd && profile.stateCd !== 'US') {
        const bbox = STATE_BBOX[profile.stateCd];
        if (bbox) {
            params.set('minlatitude', String(bbox[0]));
            params.set('maxlatitude', String(bbox[1]));
            params.set('minlongitude', String(bbox[2]));
            params.set('maxlongitude', String(bbox[3]));
        }
    }

    const res = await fetchWithTimeout(`${USGS_COMCAT}?${params.toString()}`);
    if (!res.ok) throw new Error(`USGS archive HTTP ${res.status}`);
    const geo = await res.json() as {
        features?: Array<{
            id?: string;
            properties?: {
                mag?: number; place?: string; time?: number; depth?: number;
                url?: string; detail?: string; alert?: string; sig?: number;
            };
        }>;
    };

    const features = geo.features ?? [];
    const selected = features.slice(0, 4);

    return selected.map((f) => {
        const p = f.properties ?? {};
        const m = typeof p.mag === 'number' ? p.mag.toFixed(1) : '?';
        const place = p.place ?? 'Unknown location';
        return {
            category: 'earthquake' as const,
            eventName: `M${m} — ${place}`,
            occurredAt: p.time ? friendlyDate(p.time) : 'Unknown date',
            location: place,
            magnitude: `M${m}`,
            source: 'USGS_ARCHIVE' as const,
            sourceUrl: p.url ?? undefined,
            stats: {
                alertLevel: typeof p.alert === 'string' ? p.alert : undefined,
                narrative: p.sig != null ? `Significance score: ${p.sig} (USGS impact index)` : undefined,
            },
        };
    });
}

// ---------------------------------------------------------------------------
// FEMA OpenFEMA — flood + wildfire
// ---------------------------------------------------------------------------

const FEMA_BASE = 'https://www.fema.gov/api/open/v2';

function formatFemaAid(amount: unknown): string | undefined {
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) return undefined;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
}

async function fetchFemaPastEvents(
    incidentType: 'Flood' | 'Fire',
    category: 'flood' | 'wildfire',
    profile: CurrentHazardProfile,
): Promise<PastHazardEvent[]> {
    const filter = encodeURIComponent(`incidentType eq '${incidentType}'`);
    let url = `${FEMA_BASE}/DisasterDeclarationsSummaries?$filter=${filter}&$orderby=declarationDate desc&$top=12&$format=json`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`FEMA declarations HTTP ${res.status}`);
    const json = await res.json() as { DisasterDeclarationsSummaries?: Record<string, unknown>[] };
    let rows = json.DisasterDeclarationsSummaries ?? [];

    // Filter to state when scoped
    if (profile.scope === 'state' && profile.stateCd && profile.stateCd !== 'US') {
        const abbr = profile.stateCd.toUpperCase();
        rows = rows.filter((r) => {
            const s = String(r.state ?? '').toUpperCase();
            return s === abbr;
        });
    }

    // Deduplicate by disasterNumber and take 4
    const seen = new Set<number>();
    const unique: Record<string, unknown>[] = [];
    for (const r of rows) {
        const n = Number(r.disasterNumber);
        if (!seen.has(n)) { seen.add(n); unique.push(r); }
        if (unique.length >= 4) break;
    }

    if (!unique.length) return [];

    // Batch-fetch FemaWebDisasterSummaries for dollar figures
    const disasterNumbers = unique.map((r) => Number(r.disasterNumber)).filter(Boolean);
    const orFilter = disasterNumbers.map((n) => `disasterNumber eq ${n}`).join(' or ');
    let summaryMap: Map<number, Record<string, unknown>> = new Map();
    try {
        const sumUrl = `${FEMA_BASE}/FemaWebDisasterSummaries?$filter=${encodeURIComponent(orFilter)}&$format=json`;
        const sumRes = await fetchWithTimeout(sumUrl);
        if (sumRes.ok) {
            const sumJson = await sumRes.json() as { FemaWebDisasterSummaries?: Record<string, unknown>[] };
            for (const s of sumJson.FemaWebDisasterSummaries ?? []) {
                const n = Number(s.disasterNumber);
                if (n) summaryMap.set(n, s);
            }
        }
    } catch {
        /* summary fetch optional — continue without dollar figures */
    }

    return unique.map((r) => {
        const disNo = Number(r.disasterNumber);
        const summary = summaryMap.get(disNo) ?? {};
        const programs: string[] = [];
        if (r.ihProgramDeclared) programs.push('Individual Assistance');
        if (r.paProgramDeclared) programs.push('Public Assistance');
        if (r.hmProgramDeclared) programs.push('Hazard Mitigation');

        const totalAid =
            (Number(summary.totalAmountIhpApproved) || 0) +
            (Number(summary.totalAmountHaApproved) || 0) +
            (Number(summary.totalAmountPaApproved) || 0);

        return {
            category,
            eventName: String(r.declarationTitle ?? r.title ?? 'FEMA Declared Disaster').toUpperCase(),
            occurredAt: r.incidentBeginDate ? isoToFriendly(String(r.incidentBeginDate)) : isoToFriendly(String(r.declarationDate ?? '')),
            location: [r.state, r.designatedArea].filter(Boolean).join(', ') || String(r.state ?? ''),
            source: 'FEMA_OPENFEMA' as const,
            sourceUrl: `https://www.fema.gov/disaster/${disNo}`,
            stats: {
                federalAidApprovedUSD: totalAid > 0 ? totalAid : undefined,
                individualApplicationsApproved: Number(summary.totalNumberIaApproved) || undefined,
                disasterNumber: disNo || undefined,
                programsActivated: programs.length ? programs : undefined,
                narrative: r.incidentType ? `FEMA ${r.incidentType} disaster declaration — disaster #${disNo}` : undefined,
            },
        } satisfies PastHazardEvent;
    });
}

// ---------------------------------------------------------------------------
// NOAA NCEI Storm Events Database — tornado, storm, hazardous, coastal_surf, marine
// ---------------------------------------------------------------------------

interface ParsedStormRow {
    state: string;
    czName: string;
    eventType: string;
    beginYearMonth: string;
    beginDay: string;
    beginTime: string;
    deathsDirect: number;
    injuriesDirect: number;
    damageProperty: string;
    damageCrops: string;
    torFScale: string;
    magnitude: string;
    magnitudeType: string;
    narrative: string;
}

// Module-level cache: year → {rows, timestamp}
const nceiCache = new Map<number, { rows: ParsedStormRow[]; ts: number }>();
// In-flight dedup: all concurrent callers for the same year share ONE download
const nceiInflight = new Map<number, Promise<ParsedStormRow[]>>();
const NCEI_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const NCEI_DOWNLOAD_TIMEOUT_MS = 90_000; // generous budget for large CSV files
const NCEI_DIR = 'https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/';

// Process-level safety net: swallow late UND_ERR_SOCKET errors from aborted uploads
// (undici emits the socket error after the awaited promise has already settled)
let _socketSafetyRegistered = false;
function ensureSocketSafetyNet(): void {
    if (_socketSafetyRegistered) return;
    _socketSafetyRegistered = true;
    const isSocketClose = (e: unknown): boolean => {
        if (!(e instanceof Error)) return false;
        const code = (e as NodeJS.ErrnoException).code;
        return code === 'UND_ERR_SOCKET' || e.message.includes('other side closed');
    };
    process.on('unhandledRejection', (reason) => {
        if (isSocketClose(reason)) return; // swallow benign late socket close
        // All other unhandled rejections: log but do NOT exit (Next.js handles these)
        console.error('[risk-historical-feed] unhandledRejection:', reason);
    });
    process.on('uncaughtException', (err) => {
        if (isSocketClose(err)) return; // swallow benign late socket close
        console.error('[risk-historical-feed] uncaughtException:', err);
        process.exit(1);
    });
}
ensureSocketSafetyNet();

/** Proper RFC-4180 CSV parser (handles quoted multi-line fields). */
function parseCsvFull(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQ = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQ) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQ = false; i++; continue;
            }
            field += ch; i++; continue;
        }
        if (ch === '"') { inQ = true; i++; continue; }
        if (ch === ',') { row.push(field); field = ''; i++; continue; }
        if (ch === '\r' && text[i + 1] === '\n') {
            row.push(field); field = '';
            if (row.length) rows.push(row);
            row = []; i += 2; continue;
        }
        if (ch === '\n') {
            row.push(field); field = '';
            if (row.length) rows.push(row);
            row = []; i++; continue;
        }
        field += ch; i++;
    }
    if (field || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

function buildRowParser(headers: string[]): (cols: string[]) => ParsedStormRow {
    const idx = (name: string) => headers.indexOf(name);
    const BEGIN_YM = idx('BEGIN_YEARMONTH');
    const BEGIN_DAY = idx('BEGIN_DAY');
    const BEGIN_TIME = idx('BEGIN_TIME');
    const STATE = idx('STATE');
    const CZ_NAME = idx('CZ_NAME');
    const EVENT_TYPE = idx('EVENT_TYPE');
    const DEATHS_D = idx('DEATHS_DIRECT');
    const INJ_D = idx('INJURIES_DIRECT');
    const DMG_PROP = idx('DAMAGE_PROPERTY');
    const DMG_CROP = idx('DAMAGE_CROPS');
    const TOR_F = idx('TOR_F_SCALE');
    const MAG = idx('MAGNITUDE');
    const MAG_TYPE = idx('MAGNITUDE_TYPE');
    const NARRATIVE = idx('EVENT_NARRATIVE');

    return (cols: string[]): ParsedStormRow => ({
        beginYearMonth: cols[BEGIN_YM] ?? '',
        beginDay: cols[BEGIN_DAY] ?? '',
        beginTime: cols[BEGIN_TIME] ?? '',
        state: (cols[STATE] ?? '').toUpperCase(),
        czName: cols[CZ_NAME] ?? '',
        eventType: cols[EVENT_TYPE] ?? '',
        deathsDirect: parseInt(cols[DEATHS_D] ?? '0') || 0,
        injuriesDirect: parseInt(cols[INJ_D] ?? '0') || 0,
        damageProperty: cols[DMG_PROP] ?? '',
        damageCrops: cols[DMG_CROP] ?? '',
        torFScale: cols[TOR_F] ?? '',
        magnitude: cols[MAG] ?? '',
        magnitudeType: cols[MAG_TYPE] ?? '',
        narrative: (cols[NARRATIVE] ?? '').slice(0, 400),
    });
}

function nceiYearMonth(beginYearMonth: string, beginDay: string, beginTime: string): string {
    const ym = beginYearMonth.trim();
    if (ym.length < 6) return 'Unknown date';
    const year = ym.slice(0, 4);
    const mo = parseInt(ym.slice(4, 6)) - 1;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const day = parseInt(beginDay) || 1;
    const t = beginTime.trim().padStart(4, '0');
    const h = parseInt(t.slice(0, 2));
    const min = t.slice(2, 4);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${monthNames[mo] ?? 'Unknown'} ${day}, ${year}, ${hr}:${min} ${ampm}`;
}

function mapEventTypeToCategory(eventType: string): IncidentHistoryCategory | null {
    const et = eventType.toUpperCase();
    if (et.includes('TORNADO')) return 'tornado';
    if (et.includes('THUNDERSTORM WIND') || et.includes('HAIL') || et.includes('HURRICANE') ||
        et.includes('TROPICAL STORM') || et.includes('TROPICAL DEPRESSION') || et.includes('LIGHTNING')) return 'storm';
    if (et.includes('WINTER') || et.includes('BLIZZARD') || et.includes('ICE STORM') ||
        et.includes('FREEZING') || et.includes('SLEET') || et.includes('COLD') || et.includes('FREEZE') ||
        et.includes('HIGH WIND') || et.includes('STRONG WIND') || et.includes('EXCESSIVE HEAT') ||
        et.includes('HEAT') || et.includes('DENSE FOG') || et.includes('DENSE SMOKE') ||
        et.includes('DUST') || et.includes('WILDFIRE') || et.includes('DEBRIS FLOW')) return 'hazardous';
    if (et.includes('COASTAL FLOOD') || et.includes('RIP CURRENT') || et.includes('HIGH SURF') ||
        et.includes('SNEAKER WAVE') || et.includes('BEACH EROSION') || et.includes('LAKESHORE FLOOD')) return 'coastal_surf';
    if (et.includes('MARINE') || et.includes('WATERSPOUT') || et.includes('SEICHE') ||
        et.includes('TSUNAMI') || et.includes('ROUGH BAR') || et.includes('FREEZING SPRAY')) return 'marine';
    return null;
}

async function getNceiStormEventsForYear(year: number): Promise<ParsedStormRow[]> {
    const cached = nceiCache.get(year);
    if (cached && Date.now() - cached.ts < NCEI_TTL_MS) return cached.rows;

    // In-flight dedup: all concurrent callers share ONE download
    const inflight = nceiInflight.get(year);
    if (inflight) return inflight;

    const job = (async (): Promise<ParsedStormRow[]> => {
        // Try disk cache before hitting the network
        const diskPath = path.join(os.tmpdir(), `ready2go-ncei-${year}.json`);
        try {
            const stat = await fs.stat(diskPath);
            if (Date.now() - stat.mtimeMs < NCEI_TTL_MS) {
                const raw = await fs.readFile(diskPath, 'utf-8');
                const rows = JSON.parse(raw) as ParsedStormRow[];
                nceiCache.set(year, { rows, ts: stat.mtimeMs });
                return rows;
            }
        } catch {
            // disk cache miss — proceed to network
        }

        // Directory listing uses the shared 15 s timeout (small HTML page)
        const dirRes = await fetchWithTimeout(NCEI_DIR, { headers: { Accept: 'text/html' } });
        if (!dirRes.ok) throw new Error(`NCEI directory HTTP ${dirRes.status}`);
        const html = await dirRes.text();

        const re = new RegExp(`StormEvents_details-ftp_v1\\.0_d${year}_c(\\d+)\\.csv\\.gz`, 'g');
        let best: { compile: string; filename: string } | null = null;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null) {
            const compile = m[1];
            if (!best || compile > best.compile) best = { compile, filename: m[0] };
        }
        if (!best) throw new Error(`NCEI: no details file found for year ${year}`);

        // Large CSV download uses a generous separate timeout
        const csvUrl = `${NCEI_DIR}${best.filename}`;
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), NCEI_DOWNLOAD_TIMEOUT_MS);
        let rows: ParsedStormRow[] = [];
        try {
            const fileRes = await fetch(csvUrl, { signal: controller.signal });
            if (!fileRes.ok) throw new Error(`NCEI CSV HTTP ${fileRes.status}`);

            const buffer = Buffer.from(await fileRes.arrayBuffer());
            const decompressed = await new Promise<Buffer>((resolve, reject) => {
                zlib.gunzip(buffer, (err, result) => (err ? reject(err) : resolve(result)));
            });
            const text = decompressed.toString('utf-8');

            const allRows = parseCsvFull(text);
            if (allRows.length < 2) {
                nceiCache.set(year, { rows: [], ts: Date.now() });
                return [];
            }
            const headers = allRows[0].map((h) => h.trim().toUpperCase());
            const parseRow = buildRowParser(headers);
            // Pre-filter: keep only rows that map to a known category (cuts payload ~80%)
            rows = allRows.slice(1).map(parseRow).filter((r) => mapEventTypeToCategory(r.eventType) !== null);
        } catch (err) {
            // Cache failure with a short TTL so the next request retries after ~1 min
            nceiCache.set(year, { rows: [], ts: Date.now() - NCEI_TTL_MS + 60_000 });
            throw err;
        } finally {
            clearTimeout(timerId);
        }

        nceiCache.set(year, { rows, ts: Date.now() });
        // Persist to disk (non-fatal)
        try {
            await fs.writeFile(diskPath, JSON.stringify(rows), 'utf-8');
        } catch {
            // disk write failure is an optimization miss, not an error
        }
        return rows;
    })();

    nceiInflight.set(year, job);
    try {
        return await job;
    } finally {
        nceiInflight.delete(year);
    }
}

async function fetchNceiPastEvents(
    category: IncidentHistoryCategory,
    profile: CurrentHazardProfile,
): Promise<PastHazardEvent[]> {
    const currentYear = new Date().getFullYear();

    const applyFilters = (rows: ParsedStormRow[]): ParsedStormRow[] => {
        let out = rows.filter((r) => mapEventTypeToCategory(r.eventType) === category);
        if (profile.scope === 'state' && profile.stateCd && profile.stateCd !== 'US') {
            const stateName = STATE_ABBR_TO_NAME[profile.stateCd];
            if (stateName) out = out.filter((r) => r.state === stateName);
        }
        return out;
    };

    // Fetch year-1 first; only pull year-2 if year-1 yields fewer than 3 category matches
    let filtered: ParsedStormRow[] = [];
    try {
        filtered = applyFilters(await getNceiStormEventsForYear(currentYear - 1));
    } catch {
        /* degrade gracefully */
    }
    if (filtered.length < 3) {
        try {
            const year2 = applyFilters(await getNceiStormEventsForYear(currentYear - 2));
            filtered = [...filtered, ...year2];
        } catch {
            /* degrade gracefully */
        }
    }

    if (!filtered.length) return [];

    // Sort by date desc (BEGIN_YEARMONTH is YYYYMM — lexicographic sort works)
    filtered.sort((a, b) => {
        const da = `${a.beginYearMonth}${a.beginDay.padStart(2, '0')}`;
        const db = `${b.beginYearMonth}${b.beginDay.padStart(2, '0')}`;
        return db.localeCompare(da);
    });

    // Take 4 most recent events
    const selected = filtered.slice(0, 4);

    return selected.map((r): PastHazardEvent => {
        let magnitudeStr: string | undefined;
        if (category === 'tornado' && r.torFScale) {
            magnitudeStr = r.torFScale.trim() || undefined;
        } else if (r.magnitude && r.magnitudeType) {
            magnitudeStr = `${r.magnitude} ${r.magnitudeType}`;
        }

        return {
            category,
            eventName: `${r.eventType} — ${r.czName || r.state}`,
            occurredAt: nceiYearMonth(r.beginYearMonth, r.beginDay, r.beginTime),
            location: [r.czName, r.state].filter(Boolean).join(', '),
            magnitude: magnitudeStr,
            source: 'NCEI_STORM_EVENTS',
            stats: {
                deathsDirect: r.deathsDirect || undefined,
                injuriesDirect: r.injuriesDirect || undefined,
                propertyDamage: r.damageProperty.trim() || undefined,
                cropDamage: r.damageCrops.trim() || undefined,
                narrative: r.narrative.trim() || undefined,
            },
        };
    });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const NCEI_CATS: IncidentHistoryCategory[] = ['tornado', 'storm', 'hazardous', 'coastal_surf', 'marine'];

export async function fetchHistoricalHazardEvents(
    profile: CurrentHazardProfile,
): Promise<HistoricalHazardEvents> {
    const fetchedAt = new Date().toISOString();
    const by_incident: Partial<Record<IncidentHistoryCategory, PastHazardEvent[]>> = {};
    const sourceStatus: { source: string; ok: boolean; error?: string }[] = [];

    const cats = profile.activeCategories;

    // Run all fetchers in parallel; each is independently guarded
    await Promise.all(
        cats.map(async (cat) => {
            try {
                if (cat === 'earthquake') {
                    const events = await fetchUsgsEarthquakePastEvents(profile);
                    by_incident[cat] = events;
                    sourceStatus.push({ source: 'USGS_ARCHIVE', ok: true });
                } else if (cat === 'flood') {
                    const events = await fetchFemaPastEvents('Flood', 'flood', profile);
                    by_incident[cat] = events;
                    sourceStatus.push({ source: 'FEMA_OPENFEMA_FLOOD', ok: true });
                } else if (cat === 'wildfire') {
                    const events = await fetchFemaPastEvents('Fire', 'wildfire', profile);
                    by_incident[cat] = events;
                    sourceStatus.push({ source: 'FEMA_OPENFEMA_FIRE', ok: true });
                } else if (NCEI_CATS.includes(cat)) {
                    const events = await fetchNceiPastEvents(cat, profile);
                    by_incident[cat] = events;
                    sourceStatus.push({ source: `NCEI_STORM_EVENTS_${cat.toUpperCase()}`, ok: true });
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                sourceStatus.push({ source: cat, ok: false, error: msg });
                by_incident[cat] = []; // empty = "Data unavailable" downstream
            }
        }),
    );

    return { by_incident, fetchedAt, sourceStatus };
}
