import type { HospitalCapacityPayload, HospitalUnitRow } from './types';

function unitCountsAsIcu(u: HospitalUnitRow): boolean {
    if (u.unitType === 'icu') return true;
    if (u.unitType === 'medsurg') return false;
    return u.name.toLowerCase().includes('icu');
}

export function recomputeHospitalSummary(payload: HospitalCapacityPayload): HospitalCapacityPayload {
    let totalBeds = 0;
    let occupied = 0;
    let icuTotal = 0;
    let icuOccupied = 0;
    for (const u of payload.units) {
        totalBeds += u.capacity;
        occupied += u.occupied;
        if (unitCountsAsIcu(u)) {
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
