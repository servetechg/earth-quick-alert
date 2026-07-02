/**
 * Ingest US generator locations from data/us-generator-locations.json into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-generator-locations.ts
 *   npx tsx scripts/ingest-us-generator-locations.ts path/to/custom.json
 */
import 'dotenv/config';
import path from 'node:path';
import MapLayerGenerator from '../models/MapLayerGenerator';
import { ingestStaticGooglePlacesFromFile } from '../lib/gis/layers/static-google-places-ingest';

async function main() {
    const filePath =
        process.argv[2]?.trim() || path.join(process.cwd(), 'data', 'us-generator-locations.json');
    const result = await ingestStaticGooglePlacesFromFile(
        MapLayerGenerator,
        filePath,
        'generatorLocations',
    );
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('[generator-locations-ingest] failed:', err);
    process.exit(1);
});
