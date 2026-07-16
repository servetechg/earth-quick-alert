import type { CriticalInfraSectorId } from '@/lib/gis/critical-infrastructure-sectors';

export interface HifldNextDatasetDef {
    /** Dataset slug in HIFLD Next catalog */
    slug: string;
    /** File slug when different from dataset slug */
    fileSlug?: string;
    /** Prefix for facilityId to avoid collisions when merging datasets */
    idPrefix: string;
    titleFields: string[];
    idFields?: string[];
    /** Join multiple property fields for a unique facility id */
    compoundIdFields?: string[];
    stateFields?: string[];
    latFields?: string[];
    lngFields?: string[];
    cityFields?: string[];
    addressFields?: string[];
    zipFields?: string[];
    statusFields?: string[];
    /** Parse USPS state from trailing "City, State" text in these property fields */
    stateFromTextFields?: string[];
    /** When false, do not infer USPS state from WGS84 coordinates (default: infer) */
    inferStateFromCoords?: boolean;
    /** Optional row filter before ingest */
    includeFeature?: (props: Record<string, unknown>) => boolean;
}

export interface HifldNextSectorDef {
    sectorId: CriticalInfraSectorId;
    datasets: HifldNextDatasetDef[];
}

export interface HifldNextNormalizedSite {
    facilityId: string;
    sectorId: CriticalInfraSectorId;
    name: string;
    stateKey: string;
    lat: number;
    lng: number;
    city: string;
    address: string;
    zip: string;
    status: string;
    phone: string;
    datasetSlug: string;
    properties: Record<string, unknown>;
}

export interface HifldSiteMapMarker {
    id: string;
    facilityId: string;
    sectorId: CriticalInfraSectorId;
    title: string;
    lat: number;
    lng: number;
    stateKey: string;
    city: string;
    address: string;
    zip: string;
    status: string;
    phone: string;
    location: string;
    datasetSlug?: string;
}
