import type { HotelAvailabilityPayload } from './types';
import { seedHotel } from './mock-seeds';

/** Dev/demo in-memory persistence (per server process) for hotel responder until a DB layer is added. */
let hotel: HotelAvailabilityPayload | null = null;

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) hotel = seedHotel();
    return hotel;
}

export function setHotelAvailability(next: HotelAvailabilityPayload): HotelAvailabilityPayload {
    hotel = next;
    return hotel;
}
