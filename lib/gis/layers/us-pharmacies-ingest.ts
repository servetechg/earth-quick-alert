import { readFile } from 'node:fs/promises';
import path from 'node:path';
import connectDB from '@/lib/mongodb';
import MapLayerPharmacy from '@/models/MapLayerPharmacy';
import type { UsPharmaciesJsonBundle, UsPharmacySourceRow } from '@/lib/gis/layers/pharmacies-types';

const BULK_CHUNK = 500;

function cleanText(raw: unknown): string {
    const s = String(raw ?? '').trim();
    return s && s !== ' ' ? s : '';
}

function parseCoord(raw: unknown): number | null {
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

export function normalizeUsPharmacyRow(row: UsPharmacySourceRow): {
    placeId: string;
    doc: Record<string, unknown>;
} | null {
    const placeId = cleanText(row.placeId);
    const name = cleanText(row.displayName);
    const stateKey = cleanText(row.stateCode).toUpperCase();
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

export async function loadUsPharmaciesJson(filePath: string): Promise<UsPharmaciesJsonBundle> {
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as UsPharmaciesJsonBundle;
    if (!Array.isArray(data.pharmacies)) {
        throw new Error('Invalid pharmacies JSON: missing pharmacies array');
    }
    return data;
}

export async function ingestUsPharmaciesFromRows(rows: UsPharmacySourceRow[]): Promise<{
    fetched: number;
    upserted: number;
    skipped: number;
}> {
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
        const normalized = normalizeUsPharmacyRow(row);
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
        const result = await MapLayerPharmacy.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { fetched: rows.length, upserted, skipped };
}

export async function ingestUsPharmaciesFromFile(filePath: string): Promise<{
    fetched: number;
    upserted: number;
    skipped: number;
    filePath: string;
}> {
    const resolved = path.resolve(filePath);
    const bundle = await loadUsPharmaciesJson(resolved);
    const result = await ingestUsPharmaciesFromRows(bundle.pharmacies);
    return { ...result, filePath: resolved };
}

export function defaultUsPharmaciesJsonPath(): string {
    return path.join(process.cwd(), 'us-pharmacies.json');
}
