import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerShelter from '../models/MapLayerShelter';
import MapLayerFuelSite from '../models/MapLayerFuelSite';
import { US_STATE_BBOX } from '../lib/constants/us-state-bounding-boxes';

async function main() {
    await connectDB();
    const expectedStates = Object.keys(US_STATE_BBOX).sort();

    for (const [label, Model] of [
        ['shelters', MapLayerShelter],
        ['fuel_sites', MapLayerFuelSite],
    ] as const) {
        const total = await Model.countDocuments();
        const byState = await Model.aggregate<{ _id: string; count: number }>([
            { $group: { _id: '$stateKey', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);
        const present = new Set(byState.map((r) => r._id));
        const missing = expectedStates.filter((s) => !present.has(s));
        const empty = byState.filter((r) => r.count === 0).map((r) => r._id);

        console.log(`\n=== ${label} ===`);
        console.log(`total: ${total}`);
        console.log(`states with data: ${byState.length}/${expectedStates.length}`);
        if (missing.length) console.log(`missing states: ${missing.join(', ')}`);
        if (empty.length) console.log(`empty states: ${empty.join(', ')}`);
        console.log(
            'by state:',
            byState.map((r) => `${r._id}:${r.count}`).join(', '),
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
