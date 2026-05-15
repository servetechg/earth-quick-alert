import type {
    HospitalCapacityPayload,
    PoliceDeploymentPayload,
    HotelAvailabilityPayload,
    PoliceIncidentOperation,
    PharmacyResourceDeploymentPayload,
    TransitResourceDeploymentPayload,
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
