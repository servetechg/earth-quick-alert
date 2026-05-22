/**
 * USGS Earthquake Hazards FDSNWS Event Web Service
 * https://earthquake.usgs.gov/fdsnws/event/1/
 */

import type { UsgsEarthquakeFeature } from '@/lib/unified-event/build-from-earthquake';

const USGS_EQ_QUERY = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/** Approximate USA + territories envelope (west, south, east, north). */
export const USGS_USA_BBOX = {
    minlongitude: -180,
    minlatitude: 15,
    maxlongitude: -64,
    maxlatitude: 72,
} as const;

const USER_AGENT =
    process.env.NWS_USER_AGENT ||
    'Ready2Go-EmergencyOps/1.0 (+https://localhost; ops@agency.local; fdsnws-earthquake)';

export interface FetchUsgsEarthquakeQueryOptions {
    startTime: Date;
    endTime: Date;
    minMagnitude?: number;
    bbox?: {
        minlongitude: number;
        minlatitude: number;
        maxlongitude: number;
        maxlatitude: number;
    };
    /** Per request (USGS max 20_000). */
    pageSize?: number;
    /** Stop after this many features (0 = no cap). */
    maxEvents?: number;
}

function threeMonthsAgo(from = new Date()): Date {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() - 3);
    return d;
}

/** Default window: past 3 calendar months through now. */
export function usgsEarthquakePast3MonthsWindow(): { start: Date; end: Date } {
    const end = new Date();
    return { start: threeMonthsAgo(end), end };
}

/**
 * Paginated FDSNWS GeoJSON query. Deduplicates by feature `id`.
 */
export async function fetchUsgsEarthquakeFeatures(
    options: FetchUsgsEarthquakeQueryOptions,
): Promise<UsgsEarthquakeFeature[]> {
    const minMag = options.minMagnitude ?? 2.5;
    const pageSize = Math.min(20_000, Math.max(100, options.pageSize ?? 2000));
    const maxEvents = options.maxEvents ?? 0;
    const bbox = options.bbox ?? USGS_USA_BBOX;

    const seen = new Set<string>();
    const out: UsgsEarthquakeFeature[] = [];
    /** USGS FDSNWS offset is 1-based (offset=0 returns HTTP 400). */
    let offset = 1;
    let page = 0;

    while (true) {
        page += 1;
        const params = new URLSearchParams({
            format: 'geojson',
            starttime: options.startTime.toISOString(),
            endtime: options.endTime.toISOString(),
            minmagnitude: String(minMag),
            minlatitude: String(bbox.minlatitude),
            maxlatitude: String(bbox.maxlatitude),
            minlongitude: String(bbox.minlongitude),
            maxlongitude: String(bbox.maxlongitude),
            orderby: 'time',
            limit: String(pageSize),
            offset: String(offset),
        });

        const res = await fetch(`${USGS_EQ_QUERY}?${params}`, {
            cache: 'no-store',
            headers: { Accept: 'application/geo+json', 'User-Agent': USER_AGENT },
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(
                `USGS FDSNWS query failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`,
            );
        }

        const geo = (await res.json()) as { features?: UsgsEarthquakeFeature[] };
        const batch = geo.features ?? [];
        if (batch.length === 0) break;

        for (const f of batch) {
            const id = f?.id;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(f);
            if (maxEvents > 0 && out.length >= maxEvents) {
                return out;
            }
        }

        if (batch.length < pageSize) break;
        offset += batch.length;

        const maxPages = Math.max(1, parseInt(process.env.USGS_EQ_FDSNWS_MAX_PAGES ?? '20', 10));
        if (page >= maxPages) {
            console.warn(
                `[usgs-fdsnws] Stopped at page cap (${maxPages}); raise USGS_EQ_FDSNWS_MAX_PAGES or maxEvents if needed.`,
            );
            break;
        }
    }

    return out;
}
