/**
 * Ingest FEMA NSS shelter records per US state into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-fema-shelters-by-state.ts
 *   npx tsx scripts/ingest-fema-shelters-by-state.ts TX
 *   npx tsx scripts/ingest-fema-shelters-by-state.ts TX,AR,CA
 */
import 'dotenv/config';
import {
    ingestAllFemaShelters,
    ingestFemaSheltersForState,
    FEMA_SHELTER_INGEST_STATE_CODES,
} from '../lib/gis/layers/fema-shelters-ingest';

async function main() {
    const arg = process.argv[2]?.trim();
    const states = arg
        ? arg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
        : null;

    if (states?.length === 1) {
        const result = await ingestFemaSheltersForState(states[0]!);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const { results, totalUpserted } = await ingestAllFemaShelters({
        states: states ?? undefined,
        onStateDone: (r) => {
            console.log(
                `[fema-shelters-ingest] ${r.stateKey}: fetched=${r.fetched} upserted=${r.upserted} skipped=${r.skipped}`,
            );
        },
    });

    console.log(
        JSON.stringify(
            {
                statesProcessed: results.length,
                totalUpserted,
                availableStates: FEMA_SHELTER_INGEST_STATE_CODES.length,
            },
            null,
            2,
        ),
    );
}

main().catch((err) => {
    console.error('[fema-shelters-ingest] failed:', err);
    process.exit(1);
});
