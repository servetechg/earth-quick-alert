import connectDB from '@/lib/mongodb';
import MapLayerShelter from '@/models/MapLayerShelter';
import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { FemaShelterProperties } from '@/lib/gis/layers/shelters-types';

const FEMA_NSS_QUERY_BASE =
    'https://gis.fema.gov/arcgis/rest/services/NSS/FEMA_NSS/FeatureServer/5/query';
const INGEST_TIMEOUT_MS = 120_000;
const BULK_CHUNK = 500;
const PAGE_SIZE = 2_000;

const OUT_FIELDS = [
    'shelter_id',
    'shelter_name',
    'address_1',
    'city',
    'county_parish',
    'state',
    'zip',
    'evacuation_capacity',
    'post_impact_capacity',
    'shelter_status_code',
    'facility_usage_code',
    'wheelchair_accessible',
    'ada_compliant',
    'org_organization_name',
    'org_main_phone',
    'latitude',
    'longitude',
    'facility_type',
].join(',');

export const FEMA_SHELTER_INGEST_STATE_CODES = Object.keys(US_STATE_BBOX).sort();

function resolveFemaUserAgent(): string {
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}` : '') ||
        'https://earthquickalert.vercel.app';
    return (
        process.env.NWS_USER_AGENT?.trim() ||
        `Ready2Go-EmergencyOps/1.0 (+${appUrl}; ops@agency.local; fema-nss-ingest)`
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

function parseOptionalNumber(raw: string | number | null | undefined): number | null {
    const n = parseCoord(raw ?? undefined);
    return n == null ? null : n;
}

export function normalizeFemaShelterProperties(
    props: FemaShelterProperties,
    fallbackStateKey?: string,
): {
    shelterId: string;
    doc: Record<string, unknown>;
} | null {
    const shelterId = String(props.shelter_id ?? '').trim();
    const name = cleanText(props.shelter_name);
    const stateKey = cleanText(props.state).toUpperCase() || (fallbackStateKey?.trim().toUpperCase() ?? '');
    const lat = parseCoord(props.latitude);
    const lng = parseCoord(props.longitude);
    const facilityType = cleanText(props.facility_type).toUpperCase();

    if (!shelterId || !name || !stateKey || stateKey.length !== 2) return null;
    if (facilityType && facilityType !== 'SHELTER') return null;
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const county = cleanText(props.county_parish);
    const city = cleanText(props.city);
    const address = cleanText(props.address_1);
    const zip = cleanText(props.zip);

    return {
        shelterId,
        doc: {
            shelterId,
            name,
            stateKey,
            state: stateKey,
            county,
            address,
            city,
            zip,
            lat,
            lng,
            location: { type: 'Point', coordinates: [lng, lat] },
            shelterStatusCode: cleanText(props.shelter_status_code),
            facilityUsageCode: cleanText(props.facility_usage_code),
            evacuationCapacity: parseOptionalNumber(props.evacuation_capacity),
            postImpactCapacity: parseOptionalNumber(props.post_impact_capacity),
            wheelchairAccessible: cleanText(props.wheelchair_accessible),
            adaCompliant: cleanText(props.ada_compliant),
            organizationName: cleanText(props.org_organization_name),
            organizationPhone: cleanText(props.org_main_phone),
            properties: {
                facilityType: facilityType || 'SHELTER',
            },
            ingestedAt: new Date(),
        },
    };
}

type GeoJsonFeature = {
    properties?: FemaShelterProperties;
};

type GeoJsonResponse = {
    features?: GeoJsonFeature[];
    exceededTransferLimit?: boolean;
};

export async function fetchFemaSheltersForState(stateKey: string): Promise<FemaShelterProperties[]> {
    const usps = stateKey.trim().toUpperCase();
    const where = encodeURIComponent(`state='${usps}' AND facility_type='SHELTER'`);
    const rows: FemaShelterProperties[] = [];
    let offset = 0;

    while (true) {
        const url =
            `${FEMA_NSS_QUERY_BASE}?f=geojson&where=${where}` +
            `&outFields=${encodeURIComponent(OUT_FIELDS)}` +
            `&resultRecordCount=${PAGE_SIZE}&resultOffset=${offset}`;

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), INGEST_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': resolveFemaUserAgent(),
                    Accept: 'application/json',
                },
                cache: 'no-store',
                signal: ctrl.signal,
            });

            if (!res.ok) {
                throw new Error(`FEMA NSS ${usps} HTTP ${res.status}`);
            }

            const data = (await res.json()) as GeoJsonResponse;
            const features = Array.isArray(data.features) ? data.features : [];
            if (features.length === 0) break;

            for (const feature of features) {
                if (feature.properties) rows.push(feature.properties);
            }

            offset += features.length;
            if (features.length < PAGE_SIZE && !data.exceededTransferLimit) break;
        } finally {
            clearTimeout(timer);
        }
    }

    return rows;
}

export async function ingestFemaSheltersForState(stateKey: string): Promise<{
    stateKey: string;
    fetched: number;
    upserted: number;
    skipped: number;
}> {
    await connectDB();
    const usps = stateKey.trim().toUpperCase();
    const rawRows = await fetchFemaSheltersForState(usps);

    const ops: {
        updateOne: {
            filter: { shelterId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const row of rawRows) {
        const normalized = normalizeFemaShelterProperties(row, usps);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { shelterId: normalized.shelterId },
                update: { $set: normalized.doc },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await MapLayerShelter.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { stateKey: usps, fetched: rawRows.length, upserted, skipped };
}

export async function ingestAllFemaShelters(opts?: {
    states?: string[];
    onStateDone?: (result: Awaited<ReturnType<typeof ingestFemaSheltersForState>>) => void;
}): Promise<{
    results: Awaited<ReturnType<typeof ingestFemaSheltersForState>>[];
    totalUpserted: number;
}> {
    const states = (opts?.states?.length ? opts.states : FEMA_SHELTER_INGEST_STATE_CODES).map((s) =>
        s.trim().toUpperCase(),
    );

    const results: Awaited<ReturnType<typeof ingestFemaSheltersForState>>[] = [];
    let totalUpserted = 0;

    for (const stateKey of states) {
        const result = await ingestFemaSheltersForState(stateKey);
        results.push(result);
        totalUpserted += result.upserted;
        opts?.onStateDone?.(result);
    }

    return { results, totalUpserted };
}
