/** Slim marker payload returned to the GIS map. */
export interface FinancialSiteMapMarker {
    id: string;
    locationId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    city: string;
    address: string;
    zip: string;
    location: string;
}

/** Raw FDIC bank location record (subset used at ingest). */
export interface FdicLocationRecord {
    ID?: string | number;
    NAME?: string;
    ADDRESS?: string;
    CITY?: string;
    ZIP?: string;
    STALP?: string;
    LATITUDE?: string | number;
    LONGITUDE?: string | number;
}
