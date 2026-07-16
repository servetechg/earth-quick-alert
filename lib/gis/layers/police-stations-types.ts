/** Slim marker payload returned to the GIS map. */
export interface PoliceStationMapMarker {
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

/** Raw row from us-police-stations.json ingest bundle. */
export interface UsPoliceStationSourceRow {
    placeId: string;
    displayName: string;
    formattedAddress?: string;
    phone?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    location?: { latitude?: number; longitude?: number };
    stateCode?: string;
    stateName?: string;
}

export interface UsPoliceStationsJsonBundle {
    metadata?: Record<string, unknown>;
    policeStations: UsPoliceStationSourceRow[];
}

/** HIFLD Next dataset slug for legacy law-enforcement ingest (removed on US police ingest). */
export const LEGACY_HIFLD_POLICE_DATASET_SLUG = 'local-law-enforcement-locations';
