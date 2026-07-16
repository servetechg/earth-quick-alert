import connectDB from '@/lib/mongodb';
import MapLayerHifldSite from '@/models/MapLayerHifldSite';
import { US_STATE_BBOX } from '@/lib/constants/us-state-bounding-boxes';
import {
    downloadHifldNextGeoJson,
    resolveHifldNextGeoJsonUrl,
} from '@/lib/gis/hifld-next/catalog-client';
import { normalizeHifldNextFeature } from '@/lib/gis/hifld-next/normalize-feature';
import {
    HIFLD_NEXT_SECTOR_DEFS,
    HIFLD_NEXT_SECTOR_IDS,
    hifldNextSectorDef,
} from '@/lib/gis/hifld-next/sector-dataset-config';
import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';

const BULK_CHUNK = 500;

export const HIFLD_NEXT_INGEST_STATE_CODES = Object.keys(US_STATE_BBOX).sort();

export async function ingestHifldNextDataset(
    sectorId: CriticalInfraSectorId,
    datasetSlug: string,
    fileSlug?: string,
): Promise<{ fetched: number; upserted: number; skipped: number }> {
    const sectorDef = hifldNextSectorDef(sectorId);
    const dataset = sectorDef?.datasets.find((d) => d.slug === datasetSlug);
    if (!dataset) {
        throw new Error(`Unknown HIFLD dataset ${datasetSlug} for ${sectorId}`);
    }

    const url = await resolveHifldNextGeoJsonUrl(datasetSlug, fileSlug ?? dataset.fileSlug);
    const collection = await downloadHifldNextGeoJson(url);

    await connectDB();

    const ops: {
        updateOne: {
            filter: { sectorId: string; facilityId: string };
            update: { $set: Record<string, unknown> };
            upsert: boolean;
        };
    }[] = [];

    let skipped = 0;
    for (const feature of collection.features) {
        const normalized = normalizeHifldNextFeature(feature, sectorId, dataset);
        if (!normalized) {
            skipped += 1;
            continue;
        }

        ops.push({
            updateOne: {
                filter: {
                    sectorId: normalized.sectorId,
                    facilityId: normalized.facilityId,
                },
                update: {
                    $set: {
                        facilityId: normalized.facilityId,
                        sectorId: normalized.sectorId,
                        name: normalized.name,
                        stateKey: normalized.stateKey,
                        state: normalized.stateKey,
                        city: normalized.city,
                        address: normalized.address,
                        zip: normalized.zip,
                        status: normalized.status,
                        phone: normalized.phone,
                        datasetSlug: normalized.datasetSlug,
                        lat: normalized.lat,
                        lng: normalized.lng,
                        location: {
                            type: 'Point',
                            coordinates: [normalized.lng, normalized.lat],
                        },
                        ingestedAt: new Date(),
                    },
                },
                upsert: true,
            },
        });
    }

    let upserted = 0;
    for (let i = 0; i < ops.length; i += BULK_CHUNK) {
        const chunk = ops.slice(i, i + BULK_CHUNK);
        if (chunk.length === 0) continue;
        const result = await MapLayerHifldSite.bulkWrite(chunk, { ordered: false });
        upserted += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    }

    return { fetched: collection.features.length, upserted, skipped };
}

export async function ingestHifldNextSector(sectorId: CriticalInfraSectorId): Promise<{
    sectorId: CriticalInfraSectorId;
    datasets: Array<{
        slug: string;
        fetched: number;
        upserted: number;
        skipped: number;
    }>;
    totalUpserted: number;
    statesWithData: number;
}> {
    const sectorDef = hifldNextSectorDef(sectorId);
    if (!sectorDef) {
        throw new Error(`No HIFLD Next config for sector ${sectorId}`);
    }

    const datasets: Array<{
        slug: string;
        fetched: number;
        upserted: number;
        skipped: number;
        error?: string;
    }> = [];
    let totalUpserted = 0;

    for (const dataset of sectorDef.datasets) {
        try {
            const result = await ingestHifldNextDataset(sectorId, dataset.slug, dataset.fileSlug);
            datasets.push({ slug: dataset.slug, ...result });
            totalUpserted += result.upserted;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            datasets.push({
                slug: dataset.slug,
                fetched: 0,
                upserted: 0,
                skipped: 0,
                error: message,
            });
        }
    }

    if (totalUpserted === 0 && datasets.some((d) => d.error)) {
        throw new Error(
            datasets
                .filter((d) => d.error)
                .map((d) => `${d.slug}: ${d.error}`)
                .join('; '),
        );
    }

    await connectDB();
    const statesWithData = await MapLayerHifldSite.distinct('stateKey', { sectorId });

    return {
        sectorId,
        datasets,
        totalUpserted,
        statesWithData: statesWithData.length,
    };
}

export async function ingestAllHifldNextSectors(opts?: {
    sectors?: CriticalInfraSectorId[];
    onSectorStart?: (sectorId: CriticalInfraSectorId) => void;
    onSectorDone?: (result: Awaited<ReturnType<typeof ingestHifldNextSector>>) => void;
    onSectorError?: (sectorId: CriticalInfraSectorId, error: unknown) => void;
}): Promise<{
    results: Awaited<ReturnType<typeof ingestHifldNextSector>>[];
    failedSectors: CriticalInfraSectorId[];
}> {
    const sectors = opts?.sectors?.length ? opts.sectors : HIFLD_NEXT_SECTOR_IDS;
    const results: Awaited<ReturnType<typeof ingestHifldNextSector>>[] = [];
    const failedSectors: CriticalInfraSectorId[] = [];

    for (const sectorId of sectors) {
        opts?.onSectorStart?.(sectorId);
        try {
            const result = await ingestHifldNextSector(sectorId);
            results.push(result);
            opts?.onSectorDone?.(result);
        } catch (error) {
            failedSectors.push(sectorId);
            opts?.onSectorError?.(sectorId, error);
        }
    }

    return { results, failedSectors };
}

export { HIFLD_NEXT_SECTOR_DEFS, HIFLD_NEXT_SECTOR_IDS };
