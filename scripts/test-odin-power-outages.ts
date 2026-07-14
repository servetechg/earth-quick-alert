/**
 * Smoke-test ODIN power outage feeds.
 *
 * Usage:
 *   npx tsx scripts/test-odin-power-outages.ts
 *   npx tsx scripts/test-odin-power-outages.ts AZ NY
 */
import 'dotenv/config';
import { boundsFromStateCode } from '../lib/gis/infrastructure-search-grid';
import { fetchOdinPowerOutages } from '../lib/gis/odin/odin-outages-service';
import { odinStateNameFromUsps } from '../lib/gis/odin/odin-outages-config';

async function testState(usps: string) {
    const stateName = odinStateNameFromUsps(usps);
    if (!stateName) {
        console.log(`${usps}: not in ODIN coverage`);
        return;
    }
    const bounds = boundsFromStateCode(usps);
    const { outages, states } = await fetchOdinPowerOutages(
        bounds ? { mode: 'bounds', bounds } : { mode: 'state', stateCode: usps },
    );
    const sample = outages[0];
    console.log(
        `${usps} / ${stateName}: ${outages.length} outage polygon(s) — states queried: ${states.join(', ')}`,
    );
    if (sample) {
        console.log(
            `  sample: ${sample.name} · ${sample.metersAffected} meters · ${sample.county} · rings ${sample.paths.length}`,
        );
    }
}

async function main() {
    const args = process.argv.slice(2);
    const targets = args.length > 0 ? args : ['AZ', 'NY', 'TX'];

    for (const usps of targets) {
        await testState(usps.toUpperCase());
    }
}

void main();
