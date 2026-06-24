/**
 * Ingest FDIC bank branch locations per US state into Mongo.
 *
 * Usage:
 *   npx tsx scripts/ingest-fdic-financial-sites-by-state.ts
 *   npx tsx scripts/ingest-fdic-financial-sites-by-state.ts FL
 *   npx tsx scripts/ingest-fdic-financial-sites-by-state.ts FL,TX,CA
 *   npx tsx scripts/ingest-fdic-financial-sites-by-state.ts --missing
 */
import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerFinancialSite from '../models/MapLayerFinancialSite';
import { US_STATE_BBOX } from '../lib/constants/us-state-bounding-boxes';
import {
    ingestAllFdicFinancialSites,
    ingestFdicFinancialSitesForState,
    FDIC_FINANCIAL_INGEST_STATE_CODES,
} from '../lib/gis/layers/fdic-financial-ingest';

async function resolveTargetStates(arg?: string): Promise<string[] | null> {
    if (!arg) return null;
    if (arg.trim().toLowerCase() !== '--missing') {
        return arg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    }

    await connectDB();
    const present = await MapLayerFinancialSite.distinct('stateKey');
    const presentSet = new Set(present.map((s) => String(s).toUpperCase()));
    return Object.keys(US_STATE_BBOX)
        .map((s) => s.toUpperCase())
        .filter((s) => !presentSet.has(s));
}

async function main() {
    const arg = process.argv[2]?.trim();
    let states = await resolveTargetStates(arg);

    if (states?.length === 1) {
        const result = await ingestFdicFinancialSitesForState(states[0]!);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const maxRounds = arg?.toLowerCase() === '--missing' ? 3 : 1;
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
            console.log(`[fdic-ingest] retry round ${round}/${maxRounds} for ${states.length} states`);
        } else {
            console.log(`[fdic-ingest] starting ${states.length} states`);
        }

        const { results, failedStates, totalUpserted } = await ingestAllFdicFinancialSites({
            states: states ?? undefined,
            onStateStart: (stateKey) => {
                console.log(`[fdic-ingest] → ${stateKey}`);
            },
            onStateDone: (r) => {
                console.log(
                    `[fdic-ingest] ${r.stateKey}: fetched=${r.fetched} upserted=${r.upserted} skipped=${r.skipped}`,
                );
            },
            onStateError: (stateKey, error) => {
                console.error(
                    `[fdic-ingest] ${stateKey} FAILED:`,
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
                        message: 'FDIC financial sites ingested for all target states',
                        round,
                        statesProcessed: results.length,
                        totalUpserted: grandTotalUpserted,
                        availableStates: FDIC_FINANCIAL_INGEST_STATE_CODES.length,
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        if (round >= maxRounds) break;
        await new Promise((r) => setTimeout(r, 5_000));
    }

    console.log(
        JSON.stringify(
            {
                statesFailed: lastFailed.length,
                failedStates: lastFailed,
                totalUpserted: grandTotalUpserted,
                availableStates: FDIC_FINANCIAL_INGEST_STATE_CODES.length,
            },
            null,
            2,
        ),
    );

    if (lastFailed.length > 0) process.exit(1);
}

main().catch((err) => {
    console.error('[fdic-ingest] failed:', err);
    process.exit(1);
});
