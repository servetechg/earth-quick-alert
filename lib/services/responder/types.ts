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

/** Energy Company power outage area / crew staging point with deployed crews (GIS + resource deployment). */
export type EnergyCrewStatus = 'active' | 'limited' | 'suspended';

export interface EnergyCrewAsset {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Crews assigned or staged at this location. */
    crewsDeployed: number;
    status: EnergyCrewStatus;
    notes?: string;
}

export interface EnergyResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: EnergyCrewAsset[];
    coordinatorNotes?: string;
}

/** Gas Company leak area / crew staging point with deployed crews (GIS + resource deployment). */
export type GasCrewStatus = 'active' | 'limited' | 'suspended';

export interface GasCrewAsset {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Crews assigned or staged at this location. */
    crewsDeployed: number;
    status: GasCrewStatus;
    notes?: string;
}

export interface GasResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: GasCrewAsset[];
    coordinatorNotes?: string;
}

/** Electric Company outage area / crew staging point with deployed crews (GIS + resource deployment). */
export type ElectricCrewStatus = 'active' | 'limited' | 'suspended';

export interface ElectricCrewAsset {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Vehicles deployed at this location. */
    vehiclesDeployed: number;
    /** Crews assigned or staged at this location. */
    crewsDeployed: number;
    status: ElectricCrewStatus;
    notes?: string;
}

export interface ElectricResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: ElectricCrewAsset[];
    coordinatorNotes?: string;
}

/** Water Company crew staging point with deployed crews (GIS + resource deployment). */
export type WaterCrewStatus = 'active' | 'limited' | 'suspended';

export interface WaterCrewAsset {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Water crews assigned or staged at this location. */
    crewsDeployed: number;
    status: WaterCrewStatus;
    notes?: string;
}

export interface WaterResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: WaterCrewAsset[];
    coordinatorNotes?: string;
}

/** Food & Supply Logistics — volunteer staging / distribution network point. */
export type FoodLogisticsSiteStatus = 'active' | 'limited' | 'suspended';

export interface FoodLogisticsSite {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Volunteers assigned at this location. */
    volunteersDeployed: number;
    status: FoodLogisticsSiteStatus;
    notes?: string;
}

export interface FoodLogisticsResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: FoodLogisticsSite[];
    coordinatorNotes?: string;
}

/** National Guard — resource deployment staging point. */
export type NationalGuardSiteStatus = 'active' | 'limited' | 'suspended';

export interface NationalGuardSite {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    /** Personnel deployed at this location. */
    personnelDeployed: number;
    /** Vehicles / equipment units deployed. */
    vehiclesDeployed: number;
    status: NationalGuardSiteStatus;
    notes?: string;
}

export interface NationalGuardResourceDeploymentPayload {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: NationalGuardSite[];
    coordinatorNotes?: string;
}
