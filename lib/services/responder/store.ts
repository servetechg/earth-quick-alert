import type { HotelAvailabilityPayload } from './types';

/** In-memory persistence (per server process) for hotel responder until a DB layer is added. */
let hotel: HotelAvailabilityPayload | null = null;

function emptyHotelAvailability(): HotelAvailabilityPayload {
    return {
        propertyId: '',
        propertyName: '',
        updatedAt: new Date().toISOString(),
        source: 'api',
        roomsTotal: 0,
        roomsOccupied: 0,
        roomsHeldForEm: 0,
        adaRoomsAvailable: 0,
    };
}

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) hotel = emptyHotelAvailability();
    return hotel;
}

export function setHotelAvailability(next: HotelAvailabilityPayload): HotelAvailabilityPayload {
    hotel = next;
    return hotel;
}

import type { PublicOfficialSummaryPayload } from './types';

let publicOfficial: PublicOfficialSummaryPayload | null = null;

export function getPublicOfficialSummary(): PublicOfficialSummaryPayload {
    if (!publicOfficial) {
        publicOfficial = {
            jurisdictionId: 'po-city-1',
            jurisdictionName: 'City of Metropolis',
            updatedAt: new Date().toISOString(),
            source: 'mock',
            executiveNotes: 'Monitoring developing severe weather situation. All departments on standby.',
            eoc: {
                level: '2-partial',
                operatingCondition: 'Monitoring Severe Weather',
                personnelActive: 12,
            },
            declarations: [
                {
                    id: 'decl-001',
                    title: 'Mayoral Emergency Declaration',
                    jurisdiction: 'City of Metropolis',
                    status: 'active',
                    issuedAt: new Date(Date.now() - 86400000).toISOString(),
                    notes: 'Activates emergency procurement powers and mutual aid.',
                },
            ],
        };
    }
    return publicOfficial;
}
