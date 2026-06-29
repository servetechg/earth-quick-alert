/**
 * Report which map layer categories have full USA (52-state) Mongo coverage.
 *
 * Usage: npx tsx scripts/report-layer-ingest-status.ts
 */
import 'dotenv/config';
import connectDB from '../lib/mongodb';
import MapLayerDam from '../models/MapLayerDam';
import MapLayerShelter from '../models/MapLayerShelter';
import MapLayerFuelSite from '../models/MapLayerFuelSite';
import MapLayerPharmacy from '../models/MapLayerPharmacy';
import MapLayerPoliceStation from '../models/MapLayerPoliceStation';
import MapLayerFinancialSite from '../models/MapLayerFinancialSite';
import MapLayerHifldSite from '../models/MapLayerHifldSite';
import { US_STATE_BBOX } from '../lib/constants/us-state-bounding-boxes';
import { HIFLD_NEXT_SECTOR_IDS } from '../lib/gis/hifld-next/sector-dataset-config';
import { CRITICAL_INFRASTRUCTURE_SECTORS } from '../lib/gis/critical-infrastructure-sectors';

const EXPECTED = Object.keys(US_STATE_BBOX).length;

type LayerStatus = {
    id: string;
    label: string;
    total: number;
    statesWithData: number;
    expectedStates: number;
    complete: boolean;
    missingStates: string[];
    notes?: string;
};

async function stateCoverage(Model: { countDocuments: () => Promise<number>; distinct: (field: string, filter?: object) => Promise<string[]> }, filter?: object): Promise<{ total: number; states: string[] }> {
    const total = await Model.countDocuments(filter ?? {});
    const states = (await Model.distinct('stateKey', filter ?? {})).map((s) => String(s).toUpperCase()).sort();
    return { total, states };
}

async function main() {
    await connectDB();
    const expectedList = Object.keys(US_STATE_BBOX).sort();
    const rows: LayerStatus[] = [];

    for (const [id, Model, label] of [
        ['ci_dams', MapLayerDam, 'Dams (NID)'],
        ['shelters', MapLayerShelter, 'Shelters (FEMA NSS)'],
        ['fuel_sites', MapLayerFuelSite, 'Fuel Sites (NREL AFDC)'],
        ['pharmacies', MapLayerPharmacy, 'Pharmacies (US Google Places ingest)'],
        ['police', MapLayerPoliceStation, 'Police Stations (US Google Places ingest)'],
        ['ci_financial', MapLayerFinancialSite, 'Financial (FDIC)'],
    ] as const) {
        const { total, states } = await stateCoverage(Model);
        const missing = expectedList.filter((s) => !states.includes(s));
        rows.push({
            id,
            label,
            total,
            statesWithData: states.length,
            expectedStates: EXPECTED,
            complete: states.length >= EXPECTED && missing.length === 0,
            missingStates: missing,
        });
    }

    for (const sectorId of HIFLD_NEXT_SECTOR_IDS) {
        const sectorDef = CRITICAL_INFRASTRUCTURE_SECTORS.find((s) => s.id === sectorId);
        const { total, states } = await stateCoverage(MapLayerHifldSite, { sectorId });
        const missing = expectedList.filter((s) => !states.includes(s));
        const notes =
            sectorId === 'ci_nuclear' && states.length < EXPECTED
                ? 'National dataset ingested; reactors exist in fewer states'
                : sectorId === 'ci_food_ag' && states.length < EXPECTED
                  ? 'National dataset ingested; biofuel and ag-mineral plants exist in fewer states'
                  : total === 0
                    ? 'Served via HIFLD Next live fallback until Mongo has storage'
                    : undefined;

        rows.push({
            id: sectorId,
            label: sectorDef?.label ?? sectorId,
            total,
            statesWithData: states.length,
            expectedStates: EXPECTED,
            complete:
                sectorId === 'ci_nuclear' || sectorId === 'ci_food_ag'
                    ? total > 0
                    : states.length >= EXPECTED && missing.length === 0 && total > 0,
            missingStates: missing,
            notes,
        });
    }

    const complete = rows.filter((r) => r.complete);
    const incomplete = rows.filter((r) => !r.complete);

    console.log('\n=== FULL USA INGEST (52/52 states) ===');
    for (const row of complete) {
        console.log(`✓ ${row.label} (${row.id}): ${row.total.toLocaleString()} sites`);
    }

    console.log('\n=== INCOMPLETE / LIVE FALLBACK ===');
    for (const row of incomplete) {
        console.log(
            `○ ${row.label} (${row.id}): ${row.total.toLocaleString()} sites, ${row.statesWithData}/${row.expectedStates} states` +
                (row.missingStates.length ? ` — missing: ${row.missingStates.join(', ')}` : '') +
                (row.notes ? ` — ${row.notes}` : ''),
        );
    }

    console.log(`\nSummary: ${complete.length}/${rows.length} categories fully ingested in Mongo`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
