/**
 * Delete all Mongo rows for one HIFLD sector before re-ingest.
 * Usage: npx tsx scripts/clear-hifld-sector.ts ci_communications
 */
import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerHifldSite from '../models/MapLayerHifldSite';
import type { CriticalInfraSectorId } from '../lib/gis/critical-infrastructure-sectors';

async function main() {
    const sectorId = process.argv[2]?.trim() as CriticalInfraSectorId | undefined;
    if (!sectorId) {
        console.error('Usage: npx tsx scripts/clear-hifld-sector.ts <sectorId>');
        process.exit(1);
    }

    await connectDB();
    const result = await MapLayerHifldSite.deleteMany({ sectorId });
    console.log(JSON.stringify({ sectorId, deleted: result.deletedCount }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
