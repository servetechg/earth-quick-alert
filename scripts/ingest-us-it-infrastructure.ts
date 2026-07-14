/**
 * Ingest US IT infrastructure locations from data/us-it-infrastructure.json into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-it-infrastructure.ts
 *   npx tsx scripts/ingest-us-it-infrastructure.ts path/to/custom.json
 */
import 'dotenv/config';
import path from 'node:path';
import MapLayerItInfrastructure from '../models/MapLayerItInfrastructure';
import { ingestStaticGooglePlacesFromFile } from '../lib/gis/layers/static-google-places-ingest';

async function main() {
    const filePath =
        process.argv[2]?.trim() || path.join(process.cwd(), 'data', 'us-it-infrastructure.json');
    const result = await ingestStaticGooglePlacesFromFile(
        MapLayerItInfrastructure,
        filePath,
        'itInfrastructureLocations',
    );
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('[it-infrastructure-ingest] failed:', err);
    process.exit(1);
});
