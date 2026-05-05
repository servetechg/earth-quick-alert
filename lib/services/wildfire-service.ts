/**
 * NASA FIRMS, InciWeb RSS, and ArcGIS wildfire layers — raw fetch layer (Phase 1).
 */

import { XMLParser } from 'fast-xml-parser';

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api';
/** Default national incidents RSS (inciweb.wildfire.gov). Override with `INCIWEB_RSS_URL`. Legacy nwcg URL often returns 403 for programmatic clients. */
const INCIWEB_RSS_DEFAULT = 'https://inciweb.wildfire.gov/incidents/rss.xml';
const ARCGIS_ACTIVE_FIRES =
    'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Active_Fires/FeatureServer/0/query';

let firmsMissingKeyLogged = false;

function normalizeFirmsMapKey(raw: string): string {
    return raw.trim().replace(/^["']|["']$/g, '');
}

/**
 * Default bounding box for all U.S. states & territories (approx. west,south,east,north).
 * Covers CONUS, Alaska, Hawaii, Puerto Rico / USVI. Override with `FIRMS_BBOX` or use `world` for global.
 */
export const FIRMS_DEFAULT_BBOX = '-180,15,-64,72';

function normalizeFirmsBbox(bbox: string): string {
    return bbox
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(',');
}

/**
 * NASA validates `west,south,east,north` as comma-separated numbers, or the literal `world`.
 * Invalid env values fall back to {@link FIRMS_DEFAULT_BBOX}. Do not URL-encode this segment — encoded commas (`%2C`) trigger "Invalid area".
 */
export function resolveFirmsBbox(bbox: string): string {
    const raw = bbox.trim();
    if (/^world$/i.test(raw)) {
        return 'world';
    }
    const n = normalizeFirmsBbox(raw);
    const parts = n.split(',').map((s) => s.trim());
    if (parts.length !== 4) {
        console.warn(
            `[wildfire-service] FIRMS bbox must be 4 numbers west,south,east,north or "world"; got "${bbox}". Using default USA extent.`
        );
        return FIRMS_DEFAULT_BBOX;
    }
    const nums = parts.map((p) => parseFloat(p));
    if (nums.some((x) => !Number.isFinite(x))) {
        console.warn(`[wildfire-service] FIRMS bbox has non-numeric parts; using default USA extent.`);
        return FIRMS_DEFAULT_BBOX;
    }
    const [w, s, e, north] = nums;
    if (w < -180 || w > 180 || e < -180 || e > 180 || s < -90 || s > 90 || north < -90 || north > 90) {
        console.warn(`[wildfire-service] FIRMS bbox out of geographic range; using default USA extent.`);
        return FIRMS_DEFAULT_BBOX;
    }
    if (w >= e || s >= north) {
        console.warn(`[wildfire-service] FIRMS bbox needs west<east and south<north; using default USA extent.`);
        return FIRMS_DEFAULT_BBOX;
    }
    return nums.join(',');
}

function upstreamUserAgent(): string {
    return (
        process.env.INCIWEB_USER_AGENT?.trim() ||
        process.env.NWS_USER_AGENT?.trim() ||
        process.env.HTTP_UPSTREAM_USER_AGENT?.trim() ||
        'Ready2Go-EmergencyDashboard/1.0 (earthquick; non-production)'
    );
}

/** Same pattern as NWS: RSS endpoints often reject Node’s default UA or missing Referer. */
function upstreamFetchHeaders(): HeadersInit {
    return {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': upstreamUserAgent(),
        Referer: process.env.INCIWEB_REFERER?.trim() || 'https://inciweb.wildfire.gov/',
    };
}

function inciWebRssUrl(): string {
    const u = process.env.INCIWEB_RSS_URL?.trim();
    return u && u.length > 0 ? u : INCIWEB_RSS_DEFAULT;
}

// ─── NASA FIRMS: area CSV → records ────────────────────────────────────

export interface FIRMSRecord {
    latitude: string;
    longitude: string;
    brightness: string;
    acq_date: string;
    acq_time: string;
    confidence: string;
    frp: string;
    [key: string]: string | undefined;
}

/**
 * Hotspot / fire detection from NASA FIRMS (CSV). Requires `NASA_FIRMS_MAP_KEY`.
 * @param bbox west,south,east,north in decimal degrees (or `world` per FIRMS docs)
 * @param days NASA allows **1–5** only; larger values are clamped (values >5 cause HTTP 400)
 * @param source e.g. `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `MODIS_NRT` — see https://firms.modaps.eosdis.nasa.gov/api/area/
 */
export async function getFIRMSData(
    bbox = FIRMS_DEFAULT_BBOX,
    days = 1,
    source = 'VIIRS_SNPP_NRT'
): Promise<FIRMSRecord[]> {
    const mapKey = normalizeFirmsMapKey(process.env.NASA_FIRMS_MAP_KEY ?? '');
    if (!mapKey) {
        if (!firmsMissingKeyLogged) {
            firmsMissingKeyLogged = true;
            console.warn(
                '[wildfire-service] NASA_FIRMS_MAP_KEY is not set — FIRMS hotspot sync skipped. Get a key at https://firms.modaps.eosdis.nasa.gov/api/map_key/'
            );
        }
        return [];
    }

    const dayRange = Math.max(1, Math.min(5, Math.round(Number(days)) || 1));
    const areaSegment = resolveFirmsBbox(bbox);
    const sourceNorm = source.trim() || 'VIIRS_SNPP_NRT';

    /** Bbox must stay unencoded so commas remain literal path segments per NASA Area API. */
    const url = `${FIRMS_BASE}/area/csv/${encodeURIComponent(mapKey)}/${encodeURIComponent(sourceNorm)}/${areaSegment}/${dayRange}`;

    const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': upstreamUserAgent() },
    });
    if (!res.ok) {
        const body = (await res.text()).slice(0, 400).replace(/\s+/g, ' ');
        const hint =
            res.status === 400
                ? ' NASA Area API requires day range 1–5, valid SOURCE (e.g. VIIRS_SNPP_NRT), bbox west,south,east,north, and MAP_KEY from map_key (no extra quotes).'
                : '';
        throw new Error(`FIRMS fetch failed: ${res.status} ${res.statusText}.${hint}${body ? ` Body: ${body}` : ''}`);
    }

    const csv = await res.text();
    return parseFirmsCsv(csv) as FIRMSRecord[];
}

function parseFirmsCsv(csv: string): Record<string, string>[] {
    const lines = csv
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const values = line.split(',');
        return headers.reduce(
            (obj, h, i) => {
                obj[h] = values[i]?.trim() ?? '';
                return obj;
            },
            {} as Record<string, string>
        );
    });
}

// ─── InciWeb: RSS → incidents ──────────────────────────────────────────

export interface InciWebIncident {
    title: string;
    description: string;
    pubDate: string;
    lat: number;
    lon: number;
    link: string;
}

const rssParser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: true,
});

export async function getInciWebData(): Promise<InciWebIncident[]> {
    const url = inciWebRssUrl();
    const res = await fetch(url, {
        cache: 'no-store',
        headers: upstreamFetchHeaders(),
    });
    if (!res.ok) {
        const hint =
            res.status === 403
                ? ' (403: set INCIWEB_USER_AGENT / NWS_USER_AGENT, try INCIWEB_RSS_URL, or INCIWEB_SYNC_ENABLED=false)'
                : '';
        throw new Error(`InciWeb fetch failed: ${res.status} ${res.statusText}${hint}`);
    }

    const xml = await res.text();
    return parseInciWebXml(xml);
}

function extractFeedText(node: unknown): string {
    if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
    if (node && typeof node === 'object' && '#text' in (node as object)) {
        return String((node as { '#text': unknown })['#text']).trim();
    }
    return '';
}

/** RSS `<link>` string or Atom `<link href="…">`. */
function extractFeedLink(item: Record<string, unknown>): string {
    const link = item.link;
    if (typeof link === 'string') return link.trim();
    if (Array.isArray(link)) {
        for (const el of link) {
            if (el && typeof el === 'object' && '@_href' in el) {
                const h = (el as { '@_href'?: string })['@_href'];
                if (typeof h === 'string' && h) return h.trim();
            }
        }
    }
    if (link && typeof link === 'object') {
        const o = link as Record<string, unknown>;
        if (typeof o['@_href'] === 'string') return o['@_href'].trim();
        if (typeof o.href === 'string') return o.href.trim();
    }
    return '';
}

function parseInciWebXml(xml: string): InciWebIncident[] {
    const doc = rssParser.parse(xml) as Record<string, unknown>;
    const channel = extractChannel(doc);
    if (!channel) return [];

    const rawItems =
        channel.item ?? channel.entry ?? (channel as { items?: unknown }).items;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const results: InciWebIncident[] = [];

    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;

        const title = extractFeedText(item.title) || String(item.title ?? '').trim();
        let description =
            extractFeedText(item.description) ||
            extractFeedText(item.summary) ||
            extractFeedText(item.content) ||
            '';
        if (!description) description = String(item.description ?? item.summary ?? '').trim();

        const pubDate = String(
            item.pubDate ?? item.published ?? item.updated ?? item.pubdate ?? ''
        ).trim();

        const link = extractFeedLink(item) || String(item.link ?? '').trim();

        const geo = extractLatLon(item, description);
        if (geo == null) continue;

        results.push({
            title,
            description,
            pubDate,
            lat: geo.lat,
            lon: geo.lon,
            link,
        });
    }

    return results;
}

function extractChannel(doc: Record<string, unknown>): Record<string, unknown> | null {
    const rss = doc.rss as Record<string, unknown> | undefined;
    if (rss?.channel && typeof rss.channel === 'object') {
        return rss.channel as Record<string, unknown>;
    }
    const feed = doc.feed as Record<string, unknown> | undefined;
    if (feed && typeof feed === 'object') return feed;
    return null;
}

function parseFloatSafe(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string') return undefined;
    const n = parseFloat(v.trim());
    return Number.isFinite(n) ? n : undefined;
}

/** Pull lat/lon from geo:* tags, georss:point, or description text. */
function extractLatLon(item: Record<string, unknown>, description: string): { lat: number; lon: number } | null {
    const candidatesLat = [
        parseFloatSafe(item['geo:lat']),
        parseFloatSafe(item['georss:lat']),
        parseFloatSafe((item as { lat?: unknown }).lat),
    ];
    const candidatesLon = [
        parseFloatSafe(item['geo:long']),
        parseFloatSafe(item['geo:lon']),
        parseFloatSafe(item['georss:long']),
        parseFloatSafe((item as { lon?: unknown }).lon),
        parseFloatSafe((item as { long?: unknown }).long),
    ];

    let lat = candidatesLat.find((v) => v !== undefined);
    let lon = candidatesLon.find((v) => v !== undefined);

    const point = item['georss:point'];
    if ((lat === undefined || lon === undefined) && typeof point === 'string') {
        const parts = point.trim().split(/\s+/);
        if (parts.length >= 2) {
            const pLat = parseFloat(parts[0]);
            const pLon = parseFloat(parts[1]);
            if (Number.isFinite(pLat) && Number.isFinite(pLon)) {
                lat = pLat;
                lon = pLon;
            }
        }
    }

    if (lat === undefined || lon === undefined) {
        const m = description.match(/(-?\d{1,3}\.\d+)\s*°?\s*[NnSs]?[,;\s]+(-?\d{1,3}\.\d+)\s*°?\s*[EeWw]?/);
        if (m) {
            lat = parseFloat(m[1]);
            lon = parseFloat(m[2]);
        }
    }

    if (lat === undefined || lon === undefined) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    return { lat, lon };
}

// ─── ArcGIS: active fire perimeters / points ───────────────────────────

/**
 * Query Esri feature layer (active fires). Returns Esri JSON (features array, etc.).
 */
export async function getArcGISFires(limit = 20): Promise<unknown> {
    const params = new URLSearchParams({
        where: '1=1',
        outFields: '*',
        resultRecordCount: String(limit),
        f: 'json',
        returnGeometry: 'true',
    });

    const url = `${ARCGIS_ACTIVE_FIRES}?${params.toString()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`ArcGIS fetch failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<unknown>;
}
