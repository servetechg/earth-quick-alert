import type { HospitalCapacityPayload, HotelAvailabilityPayload } from './types';

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
        notes: 'Seed template for first-time hospital capacity — persisted as api in MongoDB.',
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
