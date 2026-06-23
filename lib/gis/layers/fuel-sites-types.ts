/** Slim marker payload returned to the GIS map. */
export interface FuelSiteMapMarker {
    id: string;
    stationRecordId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    city: string;
    address: string;
    zip: string;
    fuelType: string;
    access: string;
    status: string;
    facilityType: string;
    phone: string;
    accessHours: string;
    location: string;
}

/** Raw NREL AFDC GeoJSON feature properties (subset used at ingest). */
export interface NrelFuelStationProperties {
    id?: number | string;
    station_name?: string;
    fuel_type_code?: string;
    access_code?: string;
    groups_with_access_code?: string;
    status_code?: string;
    facility_type?: string;
    station_phone?: string;
    access_days_time?: string;
    street_address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    restricted_access?: boolean | null;
    [key: string]: unknown;
}

export const FUEL_TYPE_LABELS: Record<string, string> = {
    BD: 'Biodiesel',
    CNG: 'CNG',
    E85: 'E85',
    ELEC: 'Electric',
    HY: 'Hydrogen',
    LNG: 'LNG',
    LPG: 'Propane',
    RD: 'Renewable Diesel',
};

export const FUEL_STATUS_LABELS: Record<string, string> = {
    E: 'Available',
    P: 'Planned',
    T: 'Temporarily unavailable',
};

export const FUEL_ACCESS_LABELS: Record<string, string> = {
    public: 'Public',
    private: 'Private',
};
