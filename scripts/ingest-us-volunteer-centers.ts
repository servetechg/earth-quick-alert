/**
 * Ingest US volunteer coordination centers from data/us-volunteer-coordination-centers.json into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-volunteer-centers.ts
 *   npx tsx scripts/ingest-us-volunteer-centers.ts path/to/custom.json
 */
import 'dotenv/config';
import path from 'node:path';
import MapLayerVolunteerCenter from '../models/MapLayerVolunteerCenter';
import { ingestStaticGooglePlacesFromFile } from '../lib/gis/layers/static-google-places-ingest';

async function main() {
    const filePath =
        process.argv[2]?.trim() ||
        path.join(process.cwd(), 'data', 'us-volunteer-coordination-centers.json');
    const result = await ingestStaticGooglePlacesFromFile(
        MapLayerVolunteerCenter,
        filePath,
        'volunteerCenters',
    );
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('[volunteer-centers-ingest] failed:', err);
    process.exit(1);
});
