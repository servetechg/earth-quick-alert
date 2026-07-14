/**
 * Free MongoDB space by removing bulky `properties` blobs from map layer collections.
 * Map queries do not use this field — only normalized columns are read.
 *
 * Usage:
 *   npx tsx scripts/trim-map-layer-storage.ts
 *   npx tsx scripts/trim-map-layer-storage.ts --dry-run
 */
import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerDam from '../models/MapLayerDam';
import MapLayerShelter from '../models/MapLayerShelter';
import MapLayerFuelSite from '../models/MapLayerFuelSite';
import MapLayerFinancialSite from '../models/MapLayerFinancialSite';
import MapLayerHifldSite from '../models/MapLayerHifldSite';

const COLLECTIONS = [
    ['MapLayerHifldSite', MapLayerHifldSite],
    ['MapLayerFinancialSite', MapLayerFinancialSite],
    ['MapLayerFuelSite', MapLayerFuelSite],
    ['MapLayerShelter', MapLayerShelter],
    ['MapLayerDam', MapLayerDam],
] as const;

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    await connectDB();

    for (const [label, Model] of COLLECTIONS) {
        const withProps = await Model.countDocuments({ properties: { $exists: true, $ne: {} } });
        console.log(`[trim] ${label}: ${withProps} docs with non-empty properties`);

        if (dryRun || withProps === 0) continue;

        const result = await Model.updateMany(
            { properties: { $exists: true } },
            { $unset: { properties: '' } },
        );
        console.log(`[trim] ${label}: unset properties on ${result.modifiedCount} docs`);
    }

    if (dryRun) {
        console.log('[trim] dry-run only — no writes performed');
    }
}

main().catch((err) => {
    console.error('[trim] failed:', err);
    process.exit(1);
});
