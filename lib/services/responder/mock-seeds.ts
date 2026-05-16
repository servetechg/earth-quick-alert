import type {
    HospitalCapacityPayload,
    PoliceDeploymentPayload,
    HotelAvailabilityPayload,
    PoliceIncidentOperation,
    PharmacyResourceDeploymentPayload,
    TransitResourceDeploymentPayload,
    EnergyResourceDeploymentPayload,
    GasResourceDeploymentPayload,
    ElectricResourceDeploymentPayload,
    WaterResourceDeploymentPayload,
    FoodLogisticsResourceDeploymentPayload,
    NationalGuardResourceDeploymentPayload,
} from './types';

export function seedHospital(): HospitalCapacityPayload {
    return {
        facilityId: 'mock-fac-001',
        facilityName: 'Demo Regional Medical Center',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        summary: {
            totalBeds: 320,
            occupied: 271,
            available: 49,
            icuTotal: 24,
            icuOccupied: 22,
            icuAvailable: 2,
        },
        units: [
            { id: 'u1', name: 'Med/Surg', capacity: 180, occupied: 155 },
            { id: 'u2', name: 'ICU', capacity: 24, occupied: 22 },
            { id: 'u3', name: 'Pediatric', capacity: 36, occupied: 28 },
            { id: 'u4', name: 'Observation', capacity: 80, occupied: 66 },
        ],
        notes: 'Mock data — replace with state hospital API when available.',
    };
}

export function seedPolice(): PoliceDeploymentPayload {
    const incidentOperations: PoliceIncidentOperation[] = [
        {
            id: 'io-1',
            incidentName: 'Multi-vehicle collision — SR-12',
            teamsDeployed: 4,
            operationSummary: 'Traffic homicide support, lane closures, detour coordination with DOT.',
        },
        {
            id: 'io-2',
            incidentName: 'Industrial fire — Eastside plant',
            teamsDeployed: 6,
            operationSummary: 'Perimeter security, crowd control, mutual-aid staging with county fire.',
        },
        {
            id: 'io-3',
            incidentName: 'Civil demonstration — Capitol plaza',
            teamsDeployed: 8,
            operationSummary: 'Peacekeeping presence, liaison with organizers, plainclothes intel as needed.',
        },
    ];
    return {
        agencyId: 'mock-police-001',
        agencyName: 'Demo Municipal Police',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        vehiclesDeployed: 42,
        personnelOnDuty: 118,
        incidentOperations,
        stagingAreas: [
            { id: 's1', name: 'HQ — North lot', address: '100 Public Safety Way', units: 14 },
            { id: 's2', name: 'Mobile CP — Expo center', address: '2500 Expo Dr', units: 22 },
        ],
        commanderNotes: 'Mock deployment picture for demo.',
    };
}

export function seedPharmacy(): PharmacyResourceDeploymentPayload {
    return {
        networkId: 'mock-pharmacy-net-001',
        networkName: 'Demo County Pharmacy Resource Net',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'rx-1',
                name: 'Valley Rx — Civic Center',
                address: '450 W State St',
                lat: 40.7608,
                lng: -111.891,
                status: 'open',
                notes: 'Flu shots + emergency refill window 8–8.',
            },
            {
                id: 'rx-2',
                name: 'Mobile pharmacy pod — Expo Hall',
                address: '2500 Expo Dr',
                lat: 40.7692,
                lng: -111.905,
                status: 'limited',
                notes: 'Insulin cooler on site; line capped after 200 visits/day.',
            },
            {
                id: 'rx-3',
                name: 'Community clinic pharmacy',
                address: '1200 N Medical Dr',
                lat: 40.748,
                lng: -111.877,
                status: 'open',
                notes: 'Coordination with hospital discharge pharmacy.',
            },
        ],
        coordinatorNotes: 'Mock pharmacy pop-ups for GIS resource deployment demo.',
    };
}

export function seedTransit(): TransitResourceDeploymentPayload {
    return {
        networkId: 'mock-transit-net-001',
        networkName: 'Demo Regional Mass Transit Authority',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'tr-1',
                name: 'Central bus interchange — Block A',
                address: '200 S Main St',
                lat: 40.758,
                lng: -111.888,
                vehiclesDeployed: 28,
                status: 'active',
                notes: 'Peak headway 8 min; shelter generators checked.',
            },
            {
                id: 'tr-2',
                name: 'Light rail — Stadium station pocket track',
                address: '500 W Temple',
                lat: 40.7695,
                lng: -111.901,
                vehiclesDeployed: 14,
                status: 'limited',
                notes: 'Single-track shuttle eastbound; extra supervisors on platform.',
            },
            {
                id: 'tr-3',
                name: 'Paratransit staging — North depot',
                address: '1800 N Industrial Rd',
                lat: 40.802,
                lng: -111.92,
                vehiclesDeployed: 22,
                status: 'active',
                notes: 'ADA lift vans prioritized for hospital corridor.',
            },
        ],
        coordinatorNotes: 'Mock mass transit + vehicle deployment for GIS resource demo.',
    };
}

export function seedHotel(): HotelAvailabilityPayload {
    return {
        propertyId: 'mock-hotel-001',
        propertyName: 'Demo Conference Hotel & Shelter',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        roomsTotal: 220,
        roomsOccupied: 164,
        roomsHeldForEm: 28,
        adaRoomsAvailable: 6,
        checkInNotes: 'EOC liaison: ext. 4200 (mock).',
    };
}

export function seedEnergy(): EnergyResourceDeploymentPayload {
    return {
        networkId: 'mock-energy-net-001',
        networkName: 'Demo Power Grid',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'en-1',
                name: 'Substation Alpha',
                address: '100 Power Lane',
                lat: 40.758,
                lng: -111.888,
                crewsDeployed: 12,
                status: 'active',
                notes: 'Restoring primary feeder. ETA 2 hours.',
            },
            {
                id: 'en-2',
                name: 'Downtown Underground Network',
                address: 'Main St & 2nd South',
                lat: 40.762,
                lng: -111.890,
                crewsDeployed: 5,
                status: 'limited',
                notes: 'Flooding in vault. Awaiting pump trucks.',
            },
            {
                id: 'en-3',
                name: 'Residential Sector 4',
                address: '400 E 500 S',
                lat: 40.750,
                lng: -111.870,
                crewsDeployed: 2,
                status: 'active',
                notes: 'Tree on line, clearing debris.',
            },
        ],
        coordinatorNotes: 'Mock energy grid status and crew deployment for GIS resource demo.',
    };
}

export function seedGas(): GasResourceDeploymentPayload {
    return {
        networkId: 'mock-gas-net-001',
        networkName: 'Demo Gas Network',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'gas-1',
                name: 'Main Pipeline Sector 7',
                address: '100 Industrial Parkway',
                lat: 40.758,
                lng: -111.888,
                crewsDeployed: 8,
                status: 'active',
                notes: 'Securing pipeline leak. ETA 3 hours.',
            },
            {
                id: 'gas-2',
                name: 'Residential Area Block B',
                address: 'Elm St & 4th West',
                lat: 40.762,
                lng: -111.890,
                crewsDeployed: 3,
                status: 'limited',
                notes: 'Minor leak reported, investigation ongoing.',
            },
        ],
        coordinatorNotes: 'Mock gas network status and crew deployment for GIS resource demo.',
    };
}

export function seedElectric(): ElectricResourceDeploymentPayload {
    return {
        networkId: 'mock-electric-net-001',
        networkName: 'Demo Electric Company',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'elec-1',
                name: 'Downtown Substation Alpha',
                address: '450 Main Street',
                lat: 40.760,
                lng: -111.891,
                vehiclesDeployed: 6,
                crewsDeployed: 12,
                status: 'active',
                notes: 'Major transformer outage. 3 repair teams on-site. ETA full restoration: 6 hours.',
            },
            {
                id: 'elec-2',
                name: 'Westside Grid Sector 4',
                address: '1200 West Blvd',
                lat: 40.755,
                lng: -111.905,
                vehiclesDeployed: 3,
                crewsDeployed: 5,
                status: 'limited',
                notes: 'Partial power restored. Line crew assessing downed poles.',
            },
            {
                id: 'elec-3',
                name: 'Northgate Distribution Hub',
                address: '800 Industrial Parkway N',
                lat: 40.772,
                lng: -111.882,
                vehiclesDeployed: 4,
                crewsDeployed: 8,
                status: 'active',
                notes: 'Preventive switchgear inspection post-earthquake.',
            },
            {
                id: 'elec-4',
                name: 'Residential Zone East 12',
                address: 'Oak Ave & 7th East',
                lat: 40.748,
                lng: -111.870,
                vehiclesDeployed: 2,
                crewsDeployed: 4,
                status: 'suspended',
                notes: 'Awaiting safety clearance from structural engineers before line work.',
            },
        ],
        coordinatorNotes: 'Mock electric company outage status and crew deployment for GIS resource demo. 4 active sites across metro area.',
    };
}

export function seedWater(): WaterResourceDeploymentPayload {
    return {
        networkId: 'mock-water-net-001',
        networkName: 'Demo Water Company',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'water-1',
                name: 'Main Reservoir Pump Station',
                address: '300 Reservoir Drive',
                lat: 40.765,
                lng: -111.895,
                crewsDeployed: 6,
                status: 'active',
                notes: 'Pump station running at 80% capacity. Crews monitoring pressure levels.',
            },
            {
                id: 'water-2',
                name: 'Eastside Water Main Break',
                address: '900 East 5th Ave',
                lat: 40.752,
                lng: -111.875,
                crewsDeployed: 4,
                status: 'limited',
                notes: 'Major water main rupture. Repair crew on-site, boil-water advisory issued.',
            },
            {
                id: 'water-3',
                name: 'Southgate Treatment Facility',
                address: '1500 Industrial Blvd S',
                lat: 40.740,
                lng: -111.900,
                crewsDeployed: 8,
                status: 'active',
                notes: 'Treatment plant operational. Extra crews for post-earthquake water quality testing.',
            },
        ],
        coordinatorNotes: 'Mock water company crew deployment for GIS resource demo. 3 active sites.',
    };
}

export function seedFoodLogistics(): FoodLogisticsResourceDeploymentPayload {
    return {
        networkId: 'mock-food-net-001',
        networkName: 'Demo Food & Supply Logistics',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'food-1',
                name: 'Central Distribution Warehouse',
                address: '200 Commerce Blvd',
                lat: 40.760,
                lng: -111.890,
                volunteersDeployed: 25,
                status: 'active',
                notes: 'Main warehouse stocked with 10,000 MREs, bottled water, and hygiene kits. 3 trucks dispatched today.',
            },
            {
                id: 'food-2',
                name: 'Eastside Community Kitchen',
                address: '855 East Center St',
                lat: 40.750,
                lng: -111.870,
                volunteersDeployed: 12,
                status: 'active',
                notes: 'Hot meals served 7am-7pm. Capacity: 400 meals/day. Currently at 85% utilization.',
            },
            {
                id: 'food-3',
                name: 'Southgate Mobile Pantry',
                address: '1400 South Main St',
                lat: 40.738,
                lng: -111.895,
                volunteersDeployed: 8,
                status: 'limited',
                notes: 'Mobile pantry unit serving displaced families. Awaiting resupply of infant formula and diapers.',
            },
            {
                id: 'food-4',
                name: 'Northgate Volunteer Staging Area',
                address: '3200 North Temple',
                lat: 40.775,
                lng: -111.910,
                volunteersDeployed: 15,
                status: 'active',
                notes: 'Volunteer check-in and orientation site. Sorting donated goods for delivery routes.',
            },
        ],
        coordinatorNotes: 'Mock food & supply logistics dashboard. 4 active distribution / staging sites across metro area.',
    };
}

export function seedNationalGuard(): NationalGuardResourceDeploymentPayload {
    return {
        networkId: 'mock-ng-net-001',
        networkName: 'Demo National Guard Unit',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        sites: [
            {
                id: 'ng-1',
                name: 'Camp Williams Forward Operating Base',
                address: '17800 Camp Williams Rd, Bluffdale',
                lat: 40.438,
                lng: -111.931,
                personnelDeployed: 120,
                vehiclesDeployed: 18,
                status: 'active',
                notes: 'Primary staging area. QRF team on 30-min recall. Aviation assets on standby.',
            },
            {
                id: 'ng-2',
                name: 'Downtown Emergency Staging Area',
                address: '400 S State St, Salt Lake City',
                lat: 40.760,
                lng: -111.889,
                personnelDeployed: 45,
                vehiclesDeployed: 8,
                status: 'active',
                notes: 'Urban search-and-rescue element. Route clearance team coordinating with city PW.',
            },
            {
                id: 'ng-3',
                name: 'Westside Distribution Point',
                address: '5600 West 3500 South',
                lat: 40.700,
                lng: -111.980,
                personnelDeployed: 30,
                vehiclesDeployed: 6,
                status: 'limited',
                notes: 'Water and MRE distribution. Awaiting fuel resupply for LMTV fleet.',
            },
            {
                id: 'ng-4',
                name: 'Northgate Medical Support Station',
                address: '3200 North Temple',
                lat: 40.775,
                lng: -111.910,
                personnelDeployed: 20,
                vehiclesDeployed: 4,
                status: 'active',
                notes: 'CBRN monitoring and medical triage support. Coordinating with county EMS.',
            },
        ],
        coordinatorNotes: 'Mock National Guard resource deployment. 4 staging sites with personnel and vehicles.',
    };
}
