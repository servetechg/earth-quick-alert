export type DataSourceBadge = 'mock' | 'api';

export interface HospitalUnitRow {
    id: string;
    name: string;
    capacity: number;
    occupied: number;
}

export interface HospitalCapacityPayload {
    facilityId: string;
    facilityName: string;
    updatedAt: string;
    source: DataSourceBadge;
    summary: {
        totalBeds: number;
        occupied: number;
        available: number;
        icuTotal: number;
        icuOccupied: number;
        icuAvailable: number;
    };
    units: HospitalUnitRow[];
    notes?: string;
}

/** Teams committed to a specific incident / operation (HQ editable). */
export interface PoliceIncidentOperation {
    id: string;
    incidentName: string;
    teamsDeployed: number;
    operationSummary: string;
}

export interface PoliceStagingArea {
    id: string;
    name: string;
    address: string;
    units: number;
}

export interface PoliceDeploymentPayload {
    agencyId: string;
    agencyName: string;
    updatedAt: string;
    source: DataSourceBadge;
    vehiclesDeployed: number;
    personnelOnDuty: number;
    /** Teams sent to incidents and current operation narrative — headquarters maintains this list. */
    incidentOperations: PoliceIncidentOperation[];
    stagingAreas: PoliceStagingArea[];
    commanderNotes?: string;
}

export interface GeneralResponderSummary {
    title: string;
    message: string;
    checklist: { id: string; label: string; done: boolean }[];
    links: { label: string; href: string }[];
}

export interface HotelAvailabilityPayload {
    propertyId: string;
    propertyName: string;
    updatedAt: string;
    source: DataSourceBadge;
    roomsTotal: number;
    roomsOccupied: number;
    roomsHeldForEm: number;
    adaRoomsAvailable: number;
    checkInNotes?: string;
}

/** Pop-up pharmacy / Rx aid site for GIS resource deployment (responder-maintained). */
export type PharmacySiteStatus = 'open' | 'limited' | 'closed';

export interface PharmacyPopUpSite {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    status: PharmacySiteStatus;
    notes?: string;
}

export interface PharmacyResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: PharmacyPopUpSite[];
    coordinatorNotes?: string;
}

/** Mass transit yard / corridor / staging point with deployed vehicle count (GIS + resource deployment). */
export type TransitAssetStatus = 'active' | 'limited' | 'suspended';

export interface TransitMassTransitAsset {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Vehicles assigned or staged at this mass-transit resource row. */
    vehiclesDeployed: number;
    status: TransitAssetStatus;
    notes?: string;
}

export interface TransitResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: TransitMassTransitAsset[];
    coordinatorNotes?: string;
}
