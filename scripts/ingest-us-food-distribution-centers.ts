/**
 * Ingest US food distribution centers from data/us-food-distribution-centers.json into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-food-distribution-centers.ts
 *   npx tsx scripts/ingest-us-food-distribution-centers.ts path/to/custom.json
 */
import 'dotenv/config';
import path from 'node:path';
import MapLayerFoodDistribution from '../models/MapLayerFoodDistribution';
import { ingestStaticGooglePlacesFromFile } from '../lib/gis/layers/static-google-places-ingest';

async function main() {
    const filePath =
        process.argv[2]?.trim() ||
        path.join(process.cwd(), 'data', 'us-food-distribution-centers.json');
    const result = await ingestStaticGooglePlacesFromFile(
        MapLayerFoodDistribution,
        filePath,
        'foodDistributionCenters',
    );
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('[food-distribution-ingest] failed:', err);
    process.exit(1);
});
