/**
 * Ingest NID (National Inventory of Dams) records per US state into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-nid-dams-by-state.ts
 *   npx tsx scripts/ingest-nid-dams-by-state.ts TX
 *   npx tsx scripts/ingest-nid-dams-by-state.ts TX,AR,CA
 */
import 'dotenv/config';
import {
    ingestAllNidDams,
    ingestNidDamsForState,
    NID_INGEST_STATE_CODES,
} from '../lib/gis/layers/nid-dams-ingest';

async function main() {
    const arg = process.argv[2]?.trim();
    const states = arg
        ? arg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
        : null;

    if (states?.length === 1) {
        const result = await ingestNidDamsForState(states[0]!);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const { results, totalUpserted } = await ingestAllNidDams({
        states: states ?? undefined,
        onStateDone: (r) => {
            console.log(
                `[nid-ingest] ${r.stateKey}: fetched=${r.fetched} upserted=${r.upserted} skipped=${r.skipped}`,
            );
        },
    });

    console.log(
        JSON.stringify(
            {
                statesProcessed: results.length,
                totalUpserted,
                availableStates: NID_INGEST_STATE_CODES.length,
            },
            null,
            2,
        ),
    );
}

main().catch((err) => {
    console.error('[nid-ingest] failed:', err);
    process.exit(1);
});
