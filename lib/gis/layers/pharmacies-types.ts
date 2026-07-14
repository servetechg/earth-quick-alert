/** Slim marker payload returned to the GIS map. */
export interface PharmacyMapMarker {
    id: string;
    placeId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    address: string;
    location: string;
}

/** Raw row from us-pharmacies.json ingest bundle. */
export interface UsPharmacySourceRow {
    placeId: string;
    displayName: string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    stateCode?: string;
    stateName?: string;
}

export interface UsPharmaciesJsonBundle {
    metadata?: Record<string, unknown>;
    pharmacies: UsPharmacySourceRow[];
}
