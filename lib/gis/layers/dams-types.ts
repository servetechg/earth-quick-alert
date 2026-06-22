/** Slim marker payload returned to the GIS map. */
export interface DamMapMarker {
    id: string;
    federalId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    hazardClass: string;
    condition: string;
    maxStorage: number | null;
    damHeight: number | null;
    location: string;
}

/** Raw NID USACE API record (subset used at ingest). */
export interface NidDamRecord {
    id?: string;
    federalId?: string;
    name?: string;
    latitude?: string | number;
    longitude?: string | number;
    stateKey?: string;
    state?: string;
    county?: string;
    countyState?: string;
    publicHazardId?: string;
    conditionAssessId?: string;
    maxStorage?: string | number;
    damHeight?: string | number;
    nidHeight?: string | number;
    dataUpdated?: string;
    websiteUrl?: string;
    [key: string]: unknown;
}

export const NID_HAZARD_LABELS: Record<string, string> = {
    '1': 'Low',
    '2': 'Significant',
    '3': 'High',
    '4': 'Very High',
    '5': 'Extremely High',
};

export const NID_CONDITION_LABELS: Record<string, string> = {
    '1': 'Not Available',
    '2': 'Satisfactory',
    '3': 'Fair',
    '4': 'Poor',
    '5': 'Unsatisfactory',
};
