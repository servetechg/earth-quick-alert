import connectDB from '@/lib/mongodb';
import MapLayerDam from '@/models/MapLayerDam';
import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import type { NidDamRecord } from '@/lib/gis/layers/dams-types';

const NID_QUERY_BASE = 'https://nid.sec.usace.army.mil/api/query';
const INGEST_TIMEOUT_MS = 120_000;
const BULK_CHUNK = 500;

function resolveNidUserAgent(): string {
    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}` : '') ||
        'https://earthquickalert.vercel.app';
    return (
        process.env.NWS_USER_AGENT?.trim() ||
        `Ready2Go-EmergencyOps/1.0 (+${appUrl}; ops@agency.local; nid-ingest)`
    );
}

export const NID_INGEST_STATE_CODES = Object.keys(US_STATE_BBOX).sort();

function parseCoord(raw: string | number | undefined): number | null {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

function parseOptionalNumber(raw: string | number | undefined): number | null {
    const n = parseCoord(raw);
    return n == null ? null : n;
}

export function normalizeNidDamRecord(raw: NidDamRecord): {
    federalId: string;
    doc: Record<string, unknown>;
} | null {
    const federalId = String(raw.federalId ?? raw.nidId ?? raw.id ?? '').trim();
    const name = String(raw.name ?? '').trim();
    const stateKey = String(raw.stateKey ?? '').trim().toUpperCase();
    const lat = parseCoord(raw.latitude);
    const lng = parseCoord(raw.longitude);

    if (!federalId || !name || !stateKey || lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const county = String(raw.county ?? '').trim();
    const countyState = String(raw.countyState ?? '').trim();
    const locationLabel = countyState || (county ? `${county}, ${stateKey}` : stateKey);

    return {
        federalId,
        doc: {
            federalId,
            nidId: String(raw.nidId ?? federalId),
            name,
            stateKey,
            state: String(raw.state ?? '').trim(),
            county,
            lat,
            lng,
            location: { type: 'Point', coordinates: [lng, lat] },
            publicHazardId: String(raw.publicHazardId ?? '').trim(),
            conditionAssessId: String(raw.conditionAssessId ?? '').trim(),
            maxStorage: parseOptionalNumber(raw.maxStorage),
            damHeight: parseOptionalNumber(raw.damHeight ?? raw.nidHeight),
            dataUpdated: String(raw.dataUpdated ?? '').trim(),
            properties: {
                websiteUrl: raw.websiteUrl,
                eapId: raw.eapId,
                usaceDistrict: raw.usaceDistrict,
                usaceDivision: raw.usaceDivision,
                spillwayTypeId: raw.spillwayTypeId,
                normalStorage: raw.normalStorage,
            },
            ingestedAt: new Date(),
        },
    };
}

export async function fetchNidDamsForState(stateKey: string): Promise<NidDamRecord[]> {
    const usps = stateKey.trim().toUpperCase();
    const url = `${NID_QUERY_BASE}?sy=${encodeURIComponent(`@stateKey:${usps}`)}&addProps=all`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), INGEST_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': resolveNidUserAgent(),
                Accept: 'application/json',
            },
            cache: 'no-store',
            signal: ctrl.signal,
        });

        if (!res.ok) {
            throw new Error(`NID ${usps} HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error(`NID ${usps} returned non-array payload`);
        }
        return data as NidDamRecord[];
    } finally {
        clearTimeout(timer);
    }
}

export async function ingestNidDamsForState(stateKey: string): Promise<{
    stateKey: string;
    fetched: number;
    upserted: number;
    skipped: number;
}> {
    await connectDB();
    const usps = stateKey.trim().toUpperCase();
    const rawRows = await fetchNidDamsForState(usps);

    const ops: {
        updateOne: {
            filter: { federalId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const row of rawRows) {
        const normalized = normalizeNidDamRecord(row);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { federalId: normalized.federalId },
                update: { $set: normalized.doc },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await MapLayerDam.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { stateKey: usps, fetched: rawRows.length, upserted, skipped };
}

export async function ingestAllNidDams(opts?: {
    states?: string[];
    onStateDone?: (result: Awaited<ReturnType<typeof ingestNidDamsForState>>) => void;
}): Promise<{
    results: Awaited<ReturnType<typeof ingestNidDamsForState>>[];
    totalUpserted: number;
}> {
    const states = (opts?.states?.length ? opts.states : NID_INGEST_STATE_CODES).map((s) =>
        s.trim().toUpperCase(),
    );

    const results: Awaited<ReturnType<typeof ingestNidDamsForState>>[] = [];
    let totalUpserted = 0;

    for (const stateKey of states) {
        const result = await ingestNidDamsForState(stateKey);
        results.push(result);
        totalUpserted += result.upserted;
        opts?.onStateDone?.(result);
    }

    return { results, totalUpserted };
}
