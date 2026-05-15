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

export interface PoliceDeploymentPayload {
    agencyName: string;
    updatedAt: string;
    source: DataSourceBadge;
    vehiclesDeployed: number;
    personnelOnDuty: number;
    stagingAreas: { id: string; name: string; address: string; units: number }[];
    activeBeats: { id: string; label: string; status: 'routine' | 'elevated' | 'critical' }[];
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
