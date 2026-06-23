import connectDB from '@/lib/mongodb';
import MapLayerFuelSite from '@/models/MapLayerFuelSite';
import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { NrelFuelStationProperties } from '@/lib/gis/layers/fuel-sites-types';

const NREL_AFDC_GEOJSON_BASE =
    process.env.NREL_AFDC_API_BASE?.trim() ||
    'https://developer.nlr.gov/api/alt-fuel-stations/v1.geojson';
const INGEST_TIMEOUT_MS = 120_000;
const BULK_CHUNK = 500;
const PAGE_SIZE = 200;
const STATE_INGEST_DELAY_MS = 3_000;
const PAGE_FETCH_DELAY_MS = 400;
const MAX_FETCH_RETRIES = 10;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNrelPage(url: string, usps: string): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), INGEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': resolveNrelUserAgent(),
                    Accept: 'application/json',
                },
                cache: 'no-store',
                signal: ctrl.signal,
                // @ts-expect-error Node fetch connect timeout (undici)
                connectTimeout: 30_000,
            });

            if (res.status === 429 || res.status === 503) {
                const waitMs = Math.min(60_000, 2_000 * 2 ** attempt);
                await sleep(waitMs);
                continue;
            }

            if (!res.ok) {
                throw new Error(`NREL AFDC ${usps} HTTP ${res.status}`);
            }

            return res;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < MAX_FETCH_RETRIES - 1) {
                await sleep(Math.min(45_000, 1_500 * 2 ** attempt));
            }
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError ?? new Error(`NREL AFDC ${usps} request failed after retries`);
}

export const NREL_FUEL_INGEST_STATE_CODES = Object.keys(US_STATE_BBOX).sort();

function resolveNrelUserAgent(): string {
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}` : '') ||
        'https://earthquickalert.vercel.app';
    return (
        process.env.NWS_USER_AGENT?.trim() ||
        `Ready2Go-EmergencyOps/1.0 (+${appUrl}; ops@agency.local; nrel-afdc-ingest)`
    );
}

export function resolveNrelAfdcApiKey(): string {
    return (
        process.env.NREL_AFDC_API_KEY?.trim() ||
        process.env.NREL_API_KEY?.trim() ||
        'DEMO_KEY'
    );
}

function cleanText(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return s && s !== ' ' ? s : '';
}

function parseCoord(raw: string | number | undefined): number | null {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

type GeoJsonFeature = {
    geometry?: { type?: string; coordinates?: [number, number] };
    properties?: NrelFuelStationProperties;
};

type GeoJsonResponse = {
    features?: GeoJsonFeature[];
    metadata?: { total_results?: number };
};

export function normalizeNrelFuelStationFeature(
    feature: GeoJsonFeature,
    fallbackStateKey?: string,
): {
    stationRecordId: string;
    doc: Record<string, unknown>;
} | null {
    const props = feature.properties;
    if (!props) return null;

    const stationRecordId = String(props.id ?? '').trim();
    const name = cleanText(props.station_name);
    const stateKey = cleanText(props.state).toUpperCase() || (fallbackStateKey?.trim().toUpperCase() ?? '');
    const coords = feature.geometry?.coordinates;
    const lng = Array.isArray(coords) ? parseCoord(coords[0]) : null;
    const lat = Array.isArray(coords) ? parseCoord(coords[1]) : null;

    if (!stationRecordId || !name || !stateKey || stateKey.length !== 2) return null;
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const country = cleanText(props.country).toUpperCase();
    if (country && country !== 'US') return null;

    return {
        stationRecordId,
        doc: {
            stationRecordId,
            name,
            stateKey,
            state: stateKey,
            city: cleanText(props.city),
            address: cleanText(props.street_address),
            zip: cleanText(props.zip),
            lat,
            lng,
            location: { type: 'Point', coordinates: [lng, lat] },
            fuelTypeCode: cleanText(props.fuel_type_code).toUpperCase(),
            accessCode: cleanText(props.access_code).toLowerCase(),
            statusCode: cleanText(props.status_code).toUpperCase(),
            facilityType: cleanText(props.facility_type),
            phone: cleanText(props.station_phone),
            accessHours: cleanText(props.access_days_time),
            properties: {
                groupsWithAccess: cleanText(props.groups_with_access_code),
                restrictedAccess: props.restricted_access ?? null,
            },
            ingestedAt: new Date(),
        },
    };
}

export async function fetchNrelFuelSitesForState(stateKey: string): Promise<GeoJsonFeature[]> {
    const usps = stateKey.trim().toUpperCase();
    const apiKey = resolveNrelAfdcApiKey();
    const rows: GeoJsonFeature[] = [];
    let offset = 0;
    let totalResults: number | null = null;

    while (true) {
        const params = new URLSearchParams({
            api_key: apiKey,
            state: usps,
            country: 'US',
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });
        const url = `${NREL_AFDC_GEOJSON_BASE}?${params.toString()}`;

        const res = await fetchNrelPage(url, usps);
        const data = (await res.json()) as GeoJsonResponse;
        if (totalResults == null && typeof data.metadata?.total_results === 'number') {
            totalResults = data.metadata.total_results;
        }

        const features = Array.isArray(data.features) ? data.features : [];
        if (features.length === 0) break;

        rows.push(...features);
        offset += features.length;

        if (totalResults != null && offset >= totalResults) break;
        if (features.length < PAGE_SIZE) break;

        await sleep(PAGE_FETCH_DELAY_MS);
    }

    return rows;
}

export async function ingestNrelFuelSitesForState(stateKey: string): Promise<{
    stateKey: string;
    fetched: number;
    upserted: number;
    skipped: number;
}> {
    await connectDB();
    const usps = stateKey.trim().toUpperCase();
    const rawRows = await fetchNrelFuelSitesForState(usps);

    const ops: {
        updateOne: {
            filter: { stationRecordId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const row of rawRows) {
        const normalized = normalizeNrelFuelStationFeature(row, usps);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { stationRecordId: normalized.stationRecordId },
                update: { $set: normalized.doc },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await MapLayerFuelSite.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { stateKey: usps, fetched: rawRows.length, upserted, skipped };
}

export async function ingestAllNrelFuelSites(opts?: {
    states?: string[];
    onStateDone?: (result: Awaited<ReturnType<typeof ingestNrelFuelSitesForState>>) => void;
    onStateError?: (stateKey: string, error: unknown) => void;
}): Promise<{
    results: Awaited<ReturnType<typeof ingestNrelFuelSitesForState>>[];
    failedStates: string[];
    totalUpserted: number;
}> {
    const states = (opts?.states?.length ? opts.states : NREL_FUEL_INGEST_STATE_CODES).map((s) =>
        s.trim().toUpperCase(),
    );

    const results: Awaited<ReturnType<typeof ingestNrelFuelSitesForState>>[] = [];
    const failedStates: string[] = [];
    let totalUpserted = 0;

    for (const stateKey of states) {
        try {
            const result = await ingestNrelFuelSitesForState(stateKey);
            results.push(result);
            totalUpserted += result.upserted;
            opts?.onStateDone?.(result);
        } catch (error) {
            failedStates.push(stateKey);
            opts?.onStateError?.(stateKey, error);
        }
        await sleep(STATE_INGEST_DELAY_MS);
    }

    return { results, failedStates, totalUpserted };
}
