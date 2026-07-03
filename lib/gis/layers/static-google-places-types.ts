/** Slim marker payload returned to the GIS map. */
export interface StaticPlaceMapMarker {
    id: string;
    placeId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    address: string;
    location: string;
}

/** Raw row from Google Places text-search JSON bundles. */
export interface StaticGooglePlaceSourceRow {
    placeId: string;
    displayName: string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    stateCode?: string;
    state?: string;
    stateName?: string;
}
