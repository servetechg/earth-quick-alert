import type {
    HospitalCapacityPayload,
    PoliceDeploymentPayload,
    HotelAvailabilityPayload,
} from './types';
import { seedHospital, seedPolice, seedHotel } from './mock-seeds';

/** Dev/demo in-memory persistence (per server process). */
let hospital: HospitalCapacityPayload | null = null;
let police: PoliceDeploymentPayload | null = null;
let hotel: HotelAvailabilityPayload | null = null;

export function getHospitalCapacity(): HospitalCapacityPayload {
    if (!hospital) hospital = seedHospital();
    return hospital;
}

export function setHospitalCapacity(next: HospitalCapacityPayload): HospitalCapacityPayload {
    hospital = next;
    return hospital;
}

export function getPoliceDeployment(): PoliceDeploymentPayload {
    if (!police) police = seedPolice();
    return police;
}

export function setPoliceDeployment(next: PoliceDeploymentPayload): PoliceDeploymentPayload {
    police = next;
    return police;
}

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) hotel = seedHotel();
    return hotel;
}

export function setHotelAvailability(next: HotelAvailabilityPayload): HotelAvailabilityPayload {
    hotel = next;
    return hotel;
}

export function recomputeHospitalSummary(payload: HospitalCapacityPayload): HospitalCapacityPayload {
    let totalBeds = 0;
    let occupied = 0;
    let icuTotal = 0;
    let icuOccupied = 0;
    for (const u of payload.units) {
        totalBeds += u.capacity;
        occupied += u.occupied;
        if (u.name.toLowerCase().includes('icu')) {
            icuTotal += u.capacity;
            icuOccupied += u.occupied;
        }
    }
    const icuAvailable = Math.max(0, icuTotal - icuOccupied);
    return {
        ...payload,
        updatedAt: new Date().toISOString(),
        summary: {
            totalBeds,
            occupied,
            available: Math.max(0, totalBeds - occupied),
            icuTotal,
            icuOccupied,
            icuAvailable,
        },
    };
}
