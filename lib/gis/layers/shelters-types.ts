/** Slim marker payload returned to the GIS map. */
export interface ShelterMapMarker {
    id: string;
    shelterId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    address: string;
    city: string;
    zip: string;
    status: string;
    evacuationCapacity: number | null;
    postImpactCapacity: number | null;
    facilityUsage: string;
    wheelchairAccessible: string;
    organization: string;
    organizationPhone: string;
    location: string;
}

/** Raw FEMA NSS ArcGIS feature properties (subset used at ingest). */
export interface FemaShelterProperties {
    shelter_id?: number | string;
    shelter_name?: string;
    address_1?: string;
    city?: string;
    county_parish?: string;
    state?: string;
    zip?: string;
    evacuation_capacity?: number | string | null;
    post_impact_capacity?: number | string | null;
    shelter_status_code?: string;
    facility_usage_code?: string;
    wheelchair_accessible?: string;
    ada_compliant?: string;
    org_organization_name?: string;
    org_main_phone?: string;
    latitude?: number | string;
    longitude?: number | string;
    facility_type?: string;
    [key: string]: unknown;
}

export const SHELTER_STATUS_LABELS: Record<string, string> = {
    OPEN: 'Open',
    CLOSED: 'Closed',
    STANDBY: 'Standby',
};

export const SHELTER_USAGE_LABELS: Record<string, string> = {
    EVAC: 'Evacuation',
    POST: 'Post-impact',
    BOTH: 'Evacuation & post-impact',
};
