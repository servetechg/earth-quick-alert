import type {
    HospitalCapacityPayload,
    PoliceDeploymentPayload,
    HotelAvailabilityPayload,
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
    return {
        agencyName: 'Demo Municipal Police',
        updatedAt: new Date().toISOString(),
        source: 'mock',
        vehiclesDeployed: 42,
        personnelOnDuty: 118,
        stagingAreas: [
            { id: 's1', name: 'HQ — North lot', address: '100 Public Safety Way', units: 14 },
            { id: 's2', name: 'Mobile CP — Expo center', address: '2500 Expo Dr', units: 22 },
        ],
        activeBeats: [
            { id: 'b1', label: 'Downtown core', status: 'elevated' },
            { id: 'b2', label: 'River district', status: 'routine' },
            { id: 'b3', label: 'Industrial east', status: 'critical' },
        ],
        commanderNotes: 'Mock deployment picture for demo.',
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
