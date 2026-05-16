import type { HotelAvailabilityPayload } from './types';

/** Dev/demo in-memory persistence (per server process) for hotel responder until a DB layer is added. */
let hotel: HotelAvailabilityPayload | null = null;

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) {
        hotel = {
            propertyId: 'default-hotel',
            propertyName: 'Unnamed Hotel',
            updatedAt: new Date().toISOString(),
            source: 'api',
            roomsTotal: 0,
            roomsOccupied: 0,
            roomsHeldForEm: 0,
            adaRoomsAvailable: 0,
            checkInNotes: '',
        };
    }
    return hotel;
}

export function setHotelAvailability(next: HotelAvailabilityPayload): HotelAvailabilityPayload {
    hotel = next;
    return hotel;
}
