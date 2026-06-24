import connectDB from '@/lib/mongodb';
import MapLayerFinancialSite from '@/models/MapLayerFinancialSite';
import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { FdicLocationRecord } from '@/lib/gis/layers/financial-sites-types';

const FDIC_LOCATIONS_BASE =
    process.env.FDIC_API_BASE?.trim() || 'https://banks.data.fdic.gov/api/locations';
const INGEST_TIMEOUT_MS = 90_000;
const BULK_CHUNK = 500;
const PAGE_SIZE = 2_000;
const PAGE_FETCH_DELAY_MS = 300;
const STATE_INGEST_DELAY_MS = 1_500;
const MAX_FETCH_RETRIES = 8;

const FDIC_FIELDS = 'NAME,ADDRESS,CITY,ZIP,STALP,LATITUDE,LONGITUDE,ID';

export const FDIC_FINANCIAL_INGEST_STATE_CODES = Object.keys(US_STATE_BBOX).sort();

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveFdicUserAgent(): string {
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}` : '') ||
        'https://earthquickalert.vercel.app';
    return (
        process.env.NWS_USER_AGENT?.trim() ||
        `Ready2Go-EmergencyOps/1.0 (+${appUrl}; ops@agency.local; fdic-locations-ingest)`
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

type FdicApiRow = {
    data?: FdicLocationRecord;
};

type FdicApiResponse = {
    meta?: { total?: number };
    totals?: { count?: number };
    data?: FdicApiRow[];
};

export function normalizeFdicLocationRecord(
    record: FdicLocationRecord,
    fallbackStateKey?: string,
): {
    locationId: string;
    doc: Record<string, unknown>;
} | null {
    const locationId = cleanText(record.ID);
    const name = cleanText(record.NAME);
    const stateKey =
        cleanText(record.STALP).toUpperCase() || (fallbackStateKey?.trim().toUpperCase() ?? '');
    const lat = parseCoord(record.LATITUDE);
    const lng = parseCoord(record.LONGITUDE);

    if (!locationId || !name || !stateKey || stateKey.length !== 2) return null;
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const city = cleanText(record.CITY);
    const address = cleanText(record.ADDRESS);
    const zip = cleanText(record.ZIP).slice(0, 10);

    return {
        locationId,
        doc: {
            locationId,
            name,
            stateKey,
            state: stateKey,
            city,
            address,
            zip,
            lat,
            lng,
            location: { type: 'Point', coordinates: [lng, lat] },
            properties: { source: 'fdic' },
            ingestedAt: new Date(),
        },
    };
}

async function fetchFdicPage(url: string, usps: string): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), INGEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': resolveFdicUserAgent(),
                    Accept: 'application/json',
                },
                cache: 'no-store',
                signal: ctrl.signal,
            });

            if (res.status === 429 || res.status === 503) {
                const waitMs = Math.min(45_000, 1_500 * 2 ** attempt);
                await sleep(waitMs);
                continue;
            }

            if (!res.ok) {
                throw new Error(`FDIC locations ${usps} HTTP ${res.status}`);
            }

            return res;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < MAX_FETCH_RETRIES - 1) {
                await sleep(Math.min(30_000, 1_000 * 2 ** attempt));
            }
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError ?? new Error(`FDIC locations ${usps} request failed after retries`);
}

export async function fetchFdicLocationsForState(stateKey: string): Promise<FdicLocationRecord[]> {
    const usps = stateKey.trim().toUpperCase();
    const rows: FdicLocationRecord[] = [];
    let offset = 0;
    let total: number | null = null;

    while (true) {
        const params = new URLSearchParams({
            filters: `STALP:"${usps}"`,
            fields: FDIC_FIELDS,
            format: 'json',
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });
        const url = `${FDIC_LOCATIONS_BASE}?${params.toString()}`;

        const res = await fetchFdicPage(url, usps);
        const data = (await res.json()) as FdicApiResponse;

        if (total == null) {
            total =
                typeof data.meta?.total === 'number'
                    ? data.meta.total
                    : typeof data.totals?.count === 'number'
                      ? data.totals.count
                      : null;
        }

        const batch = (data.data ?? [])
            .map((row) => row.data)
            .filter((row): row is FdicLocationRecord => Boolean(row));

        if (batch.length === 0) break;

        rows.push(...batch);
        offset += batch.length;

        if (total != null && offset >= total) break;
        if (batch.length < PAGE_SIZE) break;

        await sleep(PAGE_FETCH_DELAY_MS);
    }

    return rows;
}

export async function ingestFdicFinancialSitesForState(stateKey: string): Promise<{
    stateKey: string;
    fetched: number;
    upserted: number;
    skipped: number;
}> {
    await connectDB();
    const usps = stateKey.trim().toUpperCase();
    const rawRows = await fetchFdicLocationsForState(usps);

    const ops: {
        updateOne: {
            filter: { locationId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const row of rawRows) {
        const normalized = normalizeFdicLocationRecord(row, usps);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { locationId: normalized.locationId },
                update: { $set: normalized.doc },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await MapLayerFinancialSite.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { stateKey: usps, fetched: rawRows.length, upserted, skipped };
}

export async function ingestAllFdicFinancialSites(opts?: {
    states?: string[];
    onStateStart?: (stateKey: string) => void;
    onStateDone?: (result: Awaited<ReturnType<typeof ingestFdicFinancialSitesForState>>) => void;
    onStateError?: (stateKey: string, error: unknown) => void;
}): Promise<{
    results: Awaited<ReturnType<typeof ingestFdicFinancialSitesForState>>[];
    failedStates: string[];
    totalUpserted: number;
}> {
    const states = (opts?.states?.length ? opts.states : FDIC_FINANCIAL_INGEST_STATE_CODES).map((s) =>
        s.trim().toUpperCase(),
    );

    const results: Awaited<ReturnType<typeof ingestFdicFinancialSitesForState>>[] = [];
    const failedStates: string[] = [];
    let totalUpserted = 0;

    for (const stateKey of states) {
        opts?.onStateStart?.(stateKey);
        try {
            const result = await ingestFdicFinancialSitesForState(stateKey);
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
