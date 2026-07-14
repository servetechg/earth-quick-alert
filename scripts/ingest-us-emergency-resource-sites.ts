/**
 * Ingest US emergency resource sites from data/us-emergency-resource-sites.json into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-emergency-resource-sites.ts
 *   npx tsx scripts/ingest-us-emergency-resource-sites.ts path/to/custom.json
 */
import 'dotenv/config';
import path from 'node:path';
import MapLayerEmergencyResourceSite from '../models/MapLayerEmergencyResourceSite';
import { ingestStaticGooglePlacesFromFile } from '../lib/gis/layers/static-google-places-ingest';

async function main() {
    const filePath =
        process.argv[2]?.trim() ||
        path.join(process.cwd(), 'data', 'us-emergency-resource-sites.json');
    const result = await ingestStaticGooglePlacesFromFile(
        MapLayerEmergencyResourceSite,
        filePath,
        'emergencyResourceSites',
    );
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('[emergency-resource-sites-ingest] failed:', err);
    process.exit(1);
});
