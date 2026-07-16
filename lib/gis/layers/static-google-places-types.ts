/** Slim marker payload returned to the GIS map. */
export interface StaticPlaceMapMarker {
    id: string;
    placeId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    address: string;
    phone: string;
    location: string;
}

/** Raw row from Google Places text-search JSON bundles. */
export interface StaticGooglePlaceSourceRow {
    placeId: string;
    displayName: string;
    formattedAddress?: string;
    phone?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    location?: { latitude?: number; longitude?: number };
    stateCode?: string;
    state?: string;
    stateName?: string;
}
