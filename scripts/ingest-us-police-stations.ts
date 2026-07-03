/**
 * Ingest US police station locations from us-police-stations.json into Mongo.
 * Removes legacy HIFLD law-enforcement records first.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-police-stations.ts
 *   npx tsx scripts/ingest-us-police-stations.ts path/to/custom-police-stations.json
 */
import 'dotenv/config';
import {
    defaultUsPoliceStationsJsonPath,
    ingestUsPoliceStationsFromFile,
} from '../lib/gis/layers/us-police-stations-ingest';

async function main() {
    const filePath = process.argv[2]?.trim() || defaultUsPoliceStationsJsonPath();
    const result = await ingestUsPoliceStationsFromFile(filePath);

    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error('[us-police-stations-ingest] failed:', err);
    process.exit(1);
});
