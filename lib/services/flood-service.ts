/**
 * USGS water gauges + NOAA National Water Prediction Service (NWPS) — raw fetch layer (Phase 1).
 */

const USGS_IV_BASE = 'https://waterservices.usgs.gov/nwis/iv';
const NOAA_NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1';

// ─── USGS instant values (e.g. gage height) ─────────────────────────────

export interface USGSIvValue {
    value: string;
    dateTime: string;
    qualifiers: string[];
}

export interface USGSTimeSeries {
    sourceInfo: {
        siteName: string;
        siteCode?: Array<{ value: string }>;
        geoLocation: {
            geogLocation: { latitude: number; longitude: number };
        };
    };
    variable: { variableName: string; unit: { unitCode: string } };
    values: Array<{
        value: USGSIvValue[];
    }>;
    name?: string;
}

interface USGSIvResponse {
    value?: {
        timeSeries?: USGSTimeSeries[];
    };
}

/**
 * USGS current river / lake gauge readings (instantaneous values).
 * @param sites USGS site numbers, e.g. ["01646500"]
 * @param parameterCd USGS parameter code; 00065 = gage height
 */
export async function getUSGSData(
    sites: string[] = ['01646500'],
    parameterCd = '00065'
): Promise<USGSTimeSeries[]> {
    if (sites.length === 0) return [];

    const siteList = sites.join(',');
    const url = `${USGS_IV_BASE}/?sites=${encodeURIComponent(siteList)}&parameterCd=${encodeURIComponent(parameterCd)}&format=json`;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as USGSIvResponse;
    return json.value?.timeSeries ?? [];
}

// ─── NOAA NWPS (reach / streamflow product) ─────────────────────────────

/**
 * NWPS streamflow (or product) for a single reach. Shape varies by product.
 * @param reachId NWPS reach id, e.g. "DCIN7"
 */
export async function getNOAAForecast(reachId: string = 'DCIN7'): Promise<unknown> {
    const url = `${NOAA_NWPS_BASE}/reaches/${encodeURIComponent(reachId)}/streamflow`;

    const res = await fetch(url, {
        headers: nwpsHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) {
        throw new Error(`NOAA fetch failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<unknown>;
}

function nwpsHeaders(): HeadersInit {
    return {
        Accept: 'application/json',
        'User-Agent':
            process.env.NWPS_USER_AGENT?.trim() ||
            process.env.NWS_USER_AGENT?.trim() ||
            'Ready2Go-EmergencyDashboard/1.0 (earthquick; nwps)',
    };
}

/**
 * Single NWPS gauge by LID (e.g. `AACS2`). More reliable than `/reaches/.../streamflow` when reach IDs are unknown.
 * @see https://api.water.noaa.gov/nwps/v1/gauges/{lid}
 */
export async function getNwpsGauge(lid: string): Promise<unknown> {
    const url = `${NOAA_NWPS_BASE}/gauges/${encodeURIComponent(lid.trim())}`;

    const res = await fetch(url, {
        headers: nwpsHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) {
        throw new Error(`NWPS gauge fetch failed: ${res.status} ${res.statusText}`);
    }

    return res.json() as Promise<unknown>;
}
