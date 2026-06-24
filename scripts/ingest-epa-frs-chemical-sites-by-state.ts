/**
 * Ingest EPA FRS chemical facilities (SEMS) per US state into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-epa-frs-chemical-sites-by-state.ts
 *   npx tsx scripts/ingest-epa-frs-chemical-sites-by-state.ts VA
 *   npx tsx scripts/ingest-epa-frs-chemical-sites-by-state.ts VA,MD,DC
 *   npx tsx scripts/ingest-epa-frs-chemical-sites-by-state.ts --missing
 */
import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerChemicalSite from '../models/MapLayerChemicalSite';
import { US_STATE_BBOX } from '../lib/constants/us-state-bounding-boxes';
import {
    ingestAllEpaFrsChemicalSites,
    ingestEpaFrsChemicalSitesForState,
    EPA_CHEMICAL_INGEST_STATE_CODES,
} from '../lib/gis/layers/epa-frs-chemical-ingest';

async function resolveTargetStates(arg?: string): Promise<string[] | null> {
    if (!arg) return null;
    if (arg.trim().toLowerCase() !== '--missing') {
        return arg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    }

    await connectDB();
    const present = await MapLayerChemicalSite.distinct('stateKey');
    const presentSet = new Set(present.map((s) => String(s).toUpperCase()));
    return Object.keys(US_STATE_BBOX)
        .map((s) => s.toUpperCase())
        .filter((s) => !presentSet.has(s));
}

async function main() {
    const arg = process.argv[2]?.trim();
    let states = await resolveTargetStates(arg);

    if (states?.length === 1) {
        const result = await ingestEpaFrsChemicalSitesForState(states[0]!);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const maxRounds = arg?.toLowerCase() === '--missing' ? 5 : 1;
    let round = 0;
    let lastFailed: string[] = [];
    let grandTotalUpserted = 0;

    while (round < maxRounds) {
        round += 1;
        if (arg?.toLowerCase() === '--missing') {
            states = await resolveTargetStates('--missing');
        }

        if (states !== null && states.length === 0) {
            console.log(JSON.stringify({ message: 'All states already ingested', round }, null, 2));
            return;
        }

        if (round > 1) {
            console.log(`[epa-frs-ingest] retry round ${round}/${maxRounds} for ${states.length} states`);
        }

        const { results, failedStates, totalUpserted } = await ingestAllEpaFrsChemicalSites({
            states: states ?? undefined,
            onStateDone: (r) => {
                console.log(
                    `[epa-frs-ingest] ${r.stateKey}: grid=${r.gridPoints} fetched=${r.fetched} upserted=${r.upserted} skipped=${r.skipped}`,
                );
            },
            onStateError: (stateKey, error) => {
                console.error(
                    `[epa-frs-ingest] ${stateKey} FAILED:`,
                    error instanceof Error ? error.message : error,
                );
            },
        });

        grandTotalUpserted += totalUpserted;
        lastFailed = failedStates;

        if (failedStates.length === 0) {
            console.log(
                JSON.stringify(
                    {
                        message: 'EPA FRS chemical sites ingested for all target states',
                        round,
                        statesProcessed: results.length,
                        totalUpserted: grandTotalUpserted,
                        availableStates: EPA_CHEMICAL_INGEST_STATE_CODES.length,
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        if (round >= maxRounds) break;
        await new Promise((r) => setTimeout(r, 10_000));
    }

    console.log(
        JSON.stringify(
            {
                statesFailed: lastFailed.length,
                failedStates: lastFailed,
                totalUpserted: grandTotalUpserted,
                availableStates: EPA_CHEMICAL_INGEST_STATE_CODES.length,
            },
            null,
            2,
        ),
    );

    if (lastFailed.length > 0) process.exit(1);
}

main().catch((err) => {
    console.error('[epa-frs-ingest] failed:', err);
    process.exit(1);
});
