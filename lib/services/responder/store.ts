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
