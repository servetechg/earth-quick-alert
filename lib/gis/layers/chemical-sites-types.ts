/** Slim marker payload returned to the GIS map. */
export interface ChemicalSiteMapMarker {
    id: string;
    registryId: string;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    county: string;
    city: string;
    address: string;
    zip: string;
    programAcronym: string;
    location: string;
}

/** Raw EPA FRS facility record (subset used at ingest). */
export interface EpaFrsFacilityRecord {
    RegistryId?: string;
    FacilityName?: string;
    LocationAddress?: string;
    SupplementalLocation?: string;
    CityName?: string;
    CountyName?: string;
    StateAbbr?: string;
    ZipCode?: string;
    FIPSCode?: string;
    Latitude83?: string | number;
    Longitude83?: string | number;
}

export const EPA_FRS_PROGRAM_LABELS: Record<string, string> = {
    SEMS: 'Superfund (SEMS)',
    CERCLIS: 'CERCLIS',
    RCRA: 'RCRA',
    TRI: 'Toxics Release Inventory',
};
