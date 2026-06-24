import connectDB from '@/lib/mongodb';
import MapLayerChemicalSite from '@/models/MapLayerChemicalSite';
import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { EpaFrsFacilityRecord } from '@/lib/gis/layers/chemical-sites-types';

const EPA_FRS_BASE =
    process.env.EPA_FRS_API_BASE?.trim() ||
    'https://ofmpub.epa.gov/frs_public2/frs_rest_services.get_facilities';
const INGEST_TIMEOUT_MS = 90_000;
const BULK_CHUNK = 500;
const SEARCH_RADIUS_MILES = 25;
const GRID_SPACING_FACTOR = 0.65;
const GRID_POINT_DELAY_MS = 600;
const STATE_INGEST_DELAY_MS = 2_000;
const MAX_FETCH_RETRIES = 8;

export const EPA_CHEMICAL_INGEST_STATE_CODES = Object.keys(US_STATE_BBOX).sort();

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveEpaUserAgent(): string {
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}` : '') ||
        'https://earthquickalert.vercel.app';
    return (
        process.env.NWS_USER_AGENT?.trim() ||
        `Ready2Go-EmergencyOps/1.0 (+${appUrl}; ops@agency.local; epa-frs-ingest)`
    );
}

export function resolveEpaFrsProgramAcronym(): string {
    return process.env.EPA_FRS_PROGRAM_ACRONYM?.trim().toUpperCase() || 'SEMS';
}

function cleanText(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return s && s !== ' ' ? s : '';
}

function parseCoord(raw: string | number | undefined): number | null {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

function milesToLatDegrees(miles: number): number {
    return miles / 69;
}

function milesToLngDegrees(miles: number, lat: number): number {
    const cos = Math.cos((lat * Math.PI) / 180);
    return miles / (69 * Math.max(0.2, Math.abs(cos)));
}

export function buildEpaFrsStateSearchGrid(stateKey: string): { lat: number; lng: number }[] {
    const bbox = US_STATE_BBOX[stateKey.trim().toUpperCase()];
    if (!bbox) return [];

    const [west, south, east, north] = bbox;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;

    const stepMiles = SEARCH_RADIUS_MILES * 2 * GRID_SPACING_FACTOR;
    const stepLat = milesToLatDegrees(stepMiles);
    const stepLng = milesToLngDegrees(stepMiles, centerLat);
    const latSpan = north - south;
    const lngSpan = east - west;

    if (latSpan <= stepLat && lngSpan <= stepLng) {
        return [{ lat: centerLat, lng: centerLng }];
    }

    const points: { lat: number; lng: number }[] = [];
    for (let lat = south + stepLat / 2; lat <= north + 0.0001; lat += stepLat) {
        for (let lng = west + stepLng / 2; lng <= east + 0.0001; lng += stepLng) {
            points.push({
                lat: Math.min(north, Math.max(south, lat)),
                lng: Math.min(east, Math.max(west, lng)),
            });
        }
    }

    if (points.length === 0) {
        return [{ lat: centerLat, lng: centerLng }];
    }

    return points;
}

function parseFrsFacilities(data: unknown): EpaFrsFacilityRecord[] {
    const raw = (data as { Results?: { FRSFacility?: EpaFrsFacilityRecord | EpaFrsFacilityRecord[] } })
        ?.Results?.FRSFacility;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
}

export function normalizeEpaFrsFacility(
    record: EpaFrsFacilityRecord,
    fallbackStateKey?: string,
    programAcronym = resolveEpaFrsProgramAcronym(),
): {
    registryId: string;
    doc: Record<string, unknown>;
} | null {
    const registryId = cleanText(record.RegistryId);
    const name = cleanText(record.FacilityName);
    const stateKey =
        cleanText(record.StateAbbr).toUpperCase() || (fallbackStateKey?.trim().toUpperCase() ?? '');
    const lat = parseCoord(record.Latitude83);
    const lng = parseCoord(record.Longitude83);

    if (!registryId || !name || !stateKey || stateKey.length !== 2) return null;
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const county = cleanText(record.CountyName);
    const city = cleanText(record.CityName);
    const address = cleanText(record.LocationAddress);
    const zip = cleanText(record.ZipCode).slice(0, 10);
    const supplementalLocation = cleanText(record.SupplementalLocation);
    const fipsCode = cleanText(record.FIPSCode);

    return {
        registryId,
        doc: {
            registryId,
            name,
            stateKey,
            state: stateKey,
            county,
            city,
            address,
            zip,
            lat,
            lng,
            location: { type: 'Point', coordinates: [lng, lat] },
            programAcronym,
            fipsCode,
            supplementalLocation,
            properties: {
                registryId,
                programAcronym,
            },
            ingestedAt: new Date(),
        },
    };
}

async function fetchEpaFrsRadial(
    lat: number,
    lng: number,
    programAcronym: string,
): Promise<EpaFrsFacilityRecord[]> {
    const params = new URLSearchParams({
        latitude83: lat.toFixed(5),
        longitude83: lng.toFixed(5),
        search_radius: String(SEARCH_RADIUS_MILES),
        pgm_sys_acrnm: programAcronym,
        output: 'JSON',
    });
    const url = `${EPA_FRS_BASE}?${params.toString()}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), INGEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': resolveEpaUserAgent(),
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

            const text = await res.text();
            if (!res.ok) {
                throw new Error(`EPA FRS HTTP ${res.status}`);
            }

            if (text.trim().startsWith('<')) {
                throw new Error('EPA FRS returned HTML (service unavailable)');
            }

            const data = JSON.parse(text) as unknown;
            return parseFrsFacilities(data);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < MAX_FETCH_RETRIES - 1) {
                await sleep(Math.min(30_000, 1_000 * 2 ** attempt));
            }
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError ?? new Error('EPA FRS radial request failed after retries');
}

export async function fetchEpaFrsChemicalSitesForState(stateKey: string): Promise<EpaFrsFacilityRecord[]> {
    const usps = stateKey.trim().toUpperCase();
    const programAcronym = resolveEpaFrsProgramAcronym();
    const grid = buildEpaFrsStateSearchGrid(usps);
    const byRegistry = new Map<string, EpaFrsFacilityRecord>();

    for (let i = 0; i < grid.length; i++) {
        const point = grid[i]!;
        const batch = await fetchEpaFrsRadial(point.lat, point.lng, programAcronym);

        for (const facility of batch) {
            const facilityState = cleanText(facility.StateAbbr).toUpperCase();
            if (facilityState && facilityState !== usps) continue;

            const registryId = cleanText(facility.RegistryId);
            if (!registryId || byRegistry.has(registryId)) continue;
            byRegistry.set(registryId, facility);
        }

        if (i < grid.length - 1) {
            await sleep(GRID_POINT_DELAY_MS);
        }
    }

    return [...byRegistry.values()];
}

export async function ingestEpaFrsChemicalSitesForState(stateKey: string): Promise<{
    stateKey: string;
    gridPoints: number;
    fetched: number;
    upserted: number;
    skipped: number;
}> {
    await connectDB();
    const usps = stateKey.trim().toUpperCase();
    const gridPoints = buildEpaFrsStateSearchGrid(usps).length;
    const rawRows = await fetchEpaFrsChemicalSitesForState(usps);
    const programAcronym = resolveEpaFrsProgramAcronym();

    const ops: {
        updateOne: {
            filter: { registryId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const row of rawRows) {
        const normalized = normalizeEpaFrsFacility(row, usps, programAcronym);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { registryId: normalized.registryId },
                update: { $set: normalized.doc },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await MapLayerChemicalSite.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { stateKey: usps, gridPoints, fetched: rawRows.length, upserted, skipped };
}

export async function ingestAllEpaFrsChemicalSites(opts?: {
    states?: string[];
    onStateDone?: (result: Awaited<ReturnType<typeof ingestEpaFrsChemicalSitesForState>>) => void;
    onStateError?: (stateKey: string, error: unknown) => void;
}): Promise<{
    results: Awaited<ReturnType<typeof ingestEpaFrsChemicalSitesForState>>[];
    failedStates: string[];
    totalUpserted: number;
}> {
    const states = (opts?.states?.length ? opts.states : EPA_CHEMICAL_INGEST_STATE_CODES).map((s) =>
        s.trim().toUpperCase(),
    );

    const results: Awaited<ReturnType<typeof ingestEpaFrsChemicalSitesForState>>[] = [];
    const failedStates: string[] = [];
    let totalUpserted = 0;

    for (const stateKey of states) {
        try {
            const result = await ingestEpaFrsChemicalSitesForState(stateKey);
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
