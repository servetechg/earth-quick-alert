/**
 * Ingest HIFLD Next national GeoJSON datasets per CISA sector into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-hifld-next-sites.ts
 *   npx tsx scripts/ingest-hifld-next-sites.ts ci_healthcare
 *   npx tsx scripts/ingest-hifld-next-sites.ts ci_healthcare,ci_energy
 *   npx tsx scripts/ingest-hifld-next-sites.ts --missing
 */
import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerHifldSite from '../models/MapLayerHifldSite';
import { US_STATE_BBOX } from '../lib/constants/us-state-bounding-boxes';
import {
    HIFLD_NEXT_SECTOR_IDS,
    ingestAllHifldNextSectors,
    ingestHifldNextSector,
} from '../lib/gis/layers/hifld-next-ingest';
import type { CriticalInfraSectorId } from '../lib/gis/critical-infrastructure-sectors';

const EXPECTED_STATES = Object.keys(US_STATE_BBOX).length;

async function sectorsMissingData(): Promise<CriticalInfraSectorId[]> {
    await connectDB();
    const missing: CriticalInfraSectorId[] = [];

    for (const sectorId of HIFLD_NEXT_SECTOR_IDS) {
        const statesWithData = await MapLayerHifldSite.distinct('stateKey', { sectorId });
        if (statesWithData.length < EXPECTED_STATES) {
            missing.push(sectorId);
        }
    }

    return missing;
}

function parseSectors(arg?: string): CriticalInfraSectorId[] | null {
    if (!arg) return null;
    if (arg.trim().toLowerCase() === '--missing') return null;

    const sectors = arg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as CriticalInfraSectorId[];

    const invalid = sectors.filter((s) => !HIFLD_NEXT_SECTOR_IDS.includes(s));
    if (invalid.length > 0) {
        throw new Error(`Unknown sectors: ${invalid.join(', ')}`);
    }

    return sectors;
}

async function main() {
    const arg = process.argv[2]?.trim();
    let sectors = parseSectors(arg);

    if (arg?.toLowerCase() === '--missing') {
        sectors = await sectorsMissingData();
        if (sectors.length === 0) {
            console.log(JSON.stringify({ message: 'All HIFLD Next sectors have full USA coverage' }, null, 2));
            return;
        }
        console.log(`[hifld-next-ingest] re-ingesting ${sectors.length} sectors missing full state coverage`);
    }

    if (sectors?.length === 1) {
        const result = await ingestHifldNextSector(sectors[0]!);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const { results, failedSectors } = await ingestAllHifldNextSectors({
        sectors: sectors ?? undefined,
        onSectorStart: (sectorId) => {
            console.log(`[hifld-next-ingest] → ${sectorId}`);
        },
        onSectorDone: (r) => {
            console.log(
                `[hifld-next-ingest] ${r.sectorId}: datasets=${r.datasets.length} upserted=${r.totalUpserted} states=${r.statesWithData}/${EXPECTED_STATES}`,
            );
        },
        onSectorError: (sectorId, error) => {
            console.error(
                `[hifld-next-ingest] ${sectorId} FAILED:`,
                error instanceof Error ? error.message : error,
            );
        },
    });

    console.log(
        JSON.stringify(
            {
                message: 'HIFLD Next ingest complete',
                sectorsProcessed: results.length,
                failedSectors,
                expectedStatesPerSector: EXPECTED_STATES,
                results: results.map((r) => ({
                    sectorId: r.sectorId,
                    totalUpserted: r.totalUpserted,
                    statesWithData: r.statesWithData,
                })),
            },
            null,
            2,
        ),
    );

    if (failedSectors.length > 0) process.exit(1);
}

main().catch((err) => {
    console.error('[hifld-next-ingest] failed:', err);
    process.exit(1);
});
