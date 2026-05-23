/**
 * Fetches active responder records relevant to a given hazard category.
 *
 * "Active" means the record shows genuine emergency deployment activity —
 * non-zero personnel/vehicles deployed, open sites, or active operations.
 * Setup-only records (a hospital that configured its beds but has nothing
 * occupied, a police agency with 0 vehicles and 0 personnel) are filtered out
 * so the AI is only called when real activity exists.
 */
import dbConnect from '@/lib/mongodb';
import ResponderHospitalCapacity from '@/models/ResponderHospitalCapacity';
import ResponderPoliceDeployment from '@/models/ResponderPoliceDeployment';
import ResponderNationalGuardDeployment from '@/models/ResponderNationalGuardDeployment';
import ResponderFederalDeployment from '@/models/ResponderFederalDeployment';
import ResponderFoodLogisticsDeployment from '@/models/ResponderFoodLogisticsDeployment';
import ResponderWaterDeployment from '@/models/ResponderWaterDeployment';
import ResponderElectricDeployment from '@/models/ResponderElectricDeployment';
import ResponderPharmacyDeployment from '@/models/ResponderPharmacyDeployment';
import ResponderNonprofitDeployment from '@/models/ResponderNonprofitDeployment';

/** Which responder verticals are relevant per hazard category */
const CATEGORY_RESPONDER_MAP: Record<string, string[]> = {
    flood:             ['hospital', 'police', 'national_guard', 'food_logistics', 'water', 'nonprofit'],
    storm:             ['hospital', 'police', 'national_guard', 'federal', 'food_logistics', 'water', 'electric', 'nonprofit'],
    wildfire:          ['hospital', 'police', 'national_guard', 'water', 'food_logistics', 'electric'],
    earthquake:        ['hospital', 'police', 'national_guard', 'federal'],
    tsunami:           ['hospital', 'police', 'national_guard', 'federal'],
    volcanic:          ['hospital', 'police', 'national_guard', 'federal'],
    landslide:         ['hospital', 'police', 'national_guard'],
    winter_weather:    ['hospital', 'police', 'national_guard', 'electric'],
    fema_declaration:  ['hospital', 'police', 'national_guard', 'federal', 'food_logistics', 'water', 'nonprofit'],
    hazardous:         ['hospital', 'police', 'national_guard', 'pharmacy'],
    air_quality:       ['hospital', 'police', 'pharmacy'],
    extreme_heat:      ['hospital', 'police', 'national_guard', 'food_logistics', 'water', 'pharmacy'],
    marine:            ['hospital', 'police'],
    coastal_surf:      ['hospital', 'police'],
};

type ResponderSnapshot = Record<string, unknown[]>;

// ─── Activity guards ──────────────────────────────────────────────────────────
// Each function returns only records that show real deployment activity.
// A record that merely exists (profile / setup data with all zeros) is excluded.

async function fetchHospitals() {
    // Active = at least one unit with occupied > 0
    const rows = await ResponderHospitalCapacity.find({
        'units.occupied': { $gt: 0 },
    }).select('facilityName notes units').lean();
    return rows;
}

async function fetchPolice() {
    // Active = vehicles or personnel deployed, or at least one incident operation
    const rows = await ResponderPoliceDeployment.find({
        $or: [
            { vehiclesDeployed: { $gt: 0 } },
            { personnelOnDuty: { $gt: 0 } },
            { 'incidentOperations.0': { $exists: true } },
        ],
    }).select('agencyName vehiclesDeployed personnelOnDuty incidentOperations stagingAreas commanderNotes').lean();
    return rows;
}

async function fetchNationalGuard() {
    // Active = at least one site with status 'active' and personnel or vehicles > 0
    const rows = await ResponderNationalGuardDeployment.find({
        sites: {
            $elemMatch: {
                status: 'active',
                $or: [{ personnelDeployed: { $gt: 0 } }, { vehiclesDeployed: { $gt: 0 } }],
            },
        },
    }).select('networkName sites coordinatorNotes').lean();
    return rows;
}

async function fetchFederal() {
    // Active = personnel deployed or at least one active staging area
    const rows = await ResponderFederalDeployment.find({
        $or: [
            { totalPersonnelDeployed: { $gt: 0 } },
            { 'stagingAreas': { $elemMatch: { status: 'active', personnelCount: { $gt: 0 } } } },
        ],
    }).select('jurisdictionName totalPersonnelDeployed stagingAreas').lean();
    return rows;
}

async function fetchFoodLogistics() {
    // Active = at least one site with status 'active' and volunteers deployed
    const rows = await ResponderFoodLogisticsDeployment.find({
        sites: { $elemMatch: { status: 'active', volunteersDeployed: { $gt: 0 } } },
    }).select('networkName sites coordinatorNotes').lean();
    return rows;
}

async function fetchWater() {
    // Active = at least one site with status 'active' and crews deployed
    const rows = await ResponderWaterDeployment.find({
        sites: { $elemMatch: { status: 'active', crewsDeployed: { $gt: 0 } } },
    }).select('networkName sites coordinatorNotes').lean();
    return rows;
}

async function fetchElectric() {
    // Active = at least one site with status 'active' and crews or vehicles deployed
    const rows = await ResponderElectricDeployment.find({
        sites: {
            $elemMatch: {
                status: 'active',
                $or: [{ crewsDeployed: { $gt: 0 } }, { vehiclesDeployed: { $gt: 0 } }],
            },
        },
    }).select('networkName sites coordinatorNotes').lean();
    return rows;
}

async function fetchPharmacy() {
    // Active = at least one site with status 'open'
    const rows = await ResponderPharmacyDeployment.find({
        sites: { $elemMatch: { status: 'open' } },
    }).select('networkName sites coordinatorNotes').lean();
    return rows;
}

async function fetchNonprofit() {
    // Active = at least one site with volunteers deployed or shelter capacity in use
    const rows = await ResponderNonprofitDeployment.find({
        sites: {
            $elemMatch: {
                status: 'active',
                $or: [{ volunteersDeployed: { $gt: 0 } }, { shelterCapacity: { $gt: 0 } }],
            },
        },
    }).select('networkName sites coordinatorNotes').lean();
    return rows;
}

const FETCHERS: Record<string, () => Promise<unknown[]>> = {
    hospital:       fetchHospitals,
    police:         fetchPolice,
    national_guard: fetchNationalGuard,
    federal:        fetchFederal,
    food_logistics: fetchFoodLogistics,
    water:          fetchWater,
    electric:       fetchElectric,
    pharmacy:       fetchPharmacy,
    nonprofit:      fetchNonprofit,
};

/**
 * TODO: Connect DB queries once live responder deployment data is available.
 * Returns empty so the UI shows the placeholder message.
 */
export async function getActiveRespondersForCategory(_category: string): Promise<ResponderSnapshot> {
    return {};
}
