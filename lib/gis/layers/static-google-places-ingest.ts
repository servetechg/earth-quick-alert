import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Model } from 'mongoose';
import connectDB from '@/lib/mongodb';
import type { StaticGooglePlaceSourceRow } from '@/lib/gis/layers/static-google-places-types';

const BULK_CHUNK = 500;

function cleanText(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return s && s !== ' ' ? s : '';
}

function parseCoord(raw: unknown): number | null {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

export function normalizeStaticGooglePlaceRow(row: StaticGooglePlaceSourceRow): {
    placeId: string;
    doc: Record<string, unknown>;
} | null {
    const placeId = cleanText(row.placeId);
    const name = cleanText(row.displayName);
    const stateKey = cleanText(row.stateCode ?? row.state).toUpperCase();
    const lat = parseCoord(row.location?.latitude);
    const lng = parseCoord(row.location?.longitude);

    if (!placeId || !name || stateKey.length !== 2) return null;
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return {
        placeId,
        doc: {
            placeId,
            name,
            stateKey,
            state: cleanText(row.stateName) || stateKey,
            address: cleanText(row.formattedAddress),
            phone: cleanText(
                row.phone || row.nationalPhoneNumber || row.internationalPhoneNumber,
            ),
            lat,
            lng,
            location: { type: 'Point', coordinates: [lng, lat] },
            properties: {
                source: 'google_places_text_search',
                googlePlaceId: placeId,
            },
            ingestedAt: new Date(),
        },
    };
}

export async function ingestStaticGooglePlacesFromRows(
    Model: Model<unknown>,
    rows: StaticGooglePlaceSourceRow[],
): Promise<{ fetched: number; upserted: number; skipped: number }> {
    await connectDB();

    const ops: {
        updateOne: {
            filter: { placeId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const row of rows) {
        const normalized = normalizeStaticGooglePlaceRow(row);
        if (!normalized) {
            skipped += 1;
            continue;
        }
        ops.push({
            updateOne: {
                filter: { placeId: normalized.placeId },
                update: { $set: normalized.doc },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await Model.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { fetched: rows.length, upserted, skipped };
}

export async function loadStaticGooglePlacesJson<T extends Record<string, unknown>>(
    filePath: string,
    arrayKey: string,
): Promise<{ rows: StaticGooglePlaceSourceRow[]; metadata?: Record<string, unknown> }> {
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as T;
    const rows = data[arrayKey];
    if (!Array.isArray(rows)) {
        throw new Error(`Invalid JSON: missing ${arrayKey} array`);
    }
    return {
        rows: rows as StaticGooglePlaceSourceRow[],
        metadata: (data.metadata as Record<string, unknown> | undefined) ?? undefined,
    };
}

export async function ingestStaticGooglePlacesFromFile(
    Model: Model<unknown>,
    filePath: string,
    arrayKey: string,
): Promise<{ fetched: number; upserted: number; skipped: number; filePath: string }> {
    const resolved = path.resolve(filePath);
    const { rows } = await loadStaticGooglePlacesJson(resolved, arrayKey);
    const result = await ingestStaticGooglePlacesFromRows(Model, rows);
    return { ...result, filePath: resolved };
}
