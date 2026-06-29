/**
 * Ingest US pharmacy locations from us-pharmacies.json into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-us-pharmacies.ts
 *   npx tsx scripts/ingest-us-pharmacies.ts path/to/custom-pharmacies.json
 */
import 'dotenv/config';
import { unlink } from 'node:fs/promises';
import {
    defaultUsPharmaciesJsonPath,
    ingestUsPharmaciesFromFile,
} from '../lib/gis/layers/us-pharmacies-ingest';

async function main() {
    const filePath = process.argv[2]?.trim() || defaultUsPharmaciesJsonPath();
    const result = await ingestUsPharmaciesFromFile(filePath);

    console.log(JSON.stringify(result, null, 2));

    if (filePath.endsWith('us-pharmacies.json')) {
        await unlink(filePath);
        console.log(JSON.stringify({ removedSourceFile: filePath }, null, 2));
    }
}

main().catch((err) => {
    console.error('[us-pharmacies-ingest] failed:', err);
    process.exit(1);
});
