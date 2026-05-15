import type {
    HospitalCapacityPayload,
    PoliceDeploymentPayload,
    HotelAvailabilityPayload,
    PharmacyResourceDeploymentPayload,
    PharmacySiteStatus,
    TransitAssetStatus,
    EnergyResourceDeploymentPayload,
    EnergyCrewStatus,
    TransitResourceDeploymentPayload,
    GasResourceDeploymentPayload,
    GasCrewStatus,
} from './types';
import { seedHospital, seedPolice, seedHotel, seedPharmacy, seedTransit, seedEnergy, seedGas } from './mock-seeds';

/** Dev/demo in-memory persistence (per server process). */
let hospital: HospitalCapacityPayload | null = null;
let police: PoliceDeploymentPayload | null = null;
let hotel: HotelAvailabilityPayload | null = null;
let pharmacy: PharmacyResourceDeploymentPayload | null = null;
let transit: TransitResourceDeploymentPayload | null = null;
let energy: EnergyResourceDeploymentPayload | null = null;
let gas: GasResourceDeploymentPayload | null = null;

export function getHospitalCapacity(): HospitalCapacityPayload {
    if (!hospital) hospital = seedHospital();
    return hospital;
}

export function setHospitalCapacity(next: HospitalCapacityPayload): HospitalCapacityPayload {
    hospital = next;
    return hospital;
}

function normalizePolicePayload(p: PoliceDeploymentPayload): PoliceDeploymentPayload {
    return {
        ...p,
        agencyId: p.agencyId?.trim() ? p.agencyId : 'mock-police-001',
        incidentOperations: Array.isArray(p.incidentOperations) ? p.incidentOperations : [],
        stagingAreas: Array.isArray(p.stagingAreas) ? p.stagingAreas : [],
    };
}

export function getPoliceDeployment(): PoliceDeploymentPayload {
    if (!police) police = seedPolice();
    police = normalizePolicePayload(police);
    return police;
}

export function setPoliceDeployment(next: PoliceDeploymentPayload): PoliceDeploymentPayload {
    police = normalizePolicePayload(next);
    return police;
}

export function getHotelAvailability(): HotelAvailabilityPayload {
    if (!hotel) hotel = seedHotel();
    return hotel;
}

export function setHotelAvailability(next: HotelAvailabilityPayload): HotelAvailabilityPayload {
    hotel = next;
    return hotel;
}

function normalizePharmacyPayload(p: PharmacyResourceDeploymentPayload): PharmacyResourceDeploymentPayload {
    const raw = Array.isArray(p.sites) ? p.sites : [];
    const sites = raw.map((s, i) => {
        const status: PharmacySiteStatus =
            s.status === 'limited' || s.status === 'closed' ? s.status : 'open';
        return {
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `rx-${i}`,
            name: String(s.name || 'Pharmacy site').slice(0, 160),
            address: String(s.address || '').slice(0, 240),
            lat: Number.isFinite(s.lat) ? s.lat : 0,
            lng: Number.isFinite(s.lng) ? s.lng : 0,
            status,
            notes: s.notes != null ? String(s.notes).slice(0, 2000) : undefined,
        };
    });
    return {
        ...p,
        networkId: p.networkId?.trim() ? p.networkId.trim() : 'mock-pharmacy-net-001',
        networkName: p.networkName?.trim() ? p.networkName.trim() : 'Pharmacy resource net',
        sites,
    };
}

export function getPharmacyResourceDeployment(): PharmacyResourceDeploymentPayload {
    if (!pharmacy) pharmacy = seedPharmacy();
    pharmacy = normalizePharmacyPayload(pharmacy);
    return pharmacy;
}

export function setPharmacyResourceDeployment(next: PharmacyResourceDeploymentPayload): PharmacyResourceDeploymentPayload {
    pharmacy = normalizePharmacyPayload(next);
    return pharmacy;
}

function normalizeTransitPayload(p: TransitResourceDeploymentPayload): TransitResourceDeploymentPayload {
    const raw = Array.isArray(p.sites) ? p.sites : [];
    const sites = raw.map((s, i) => {
        const status: TransitAssetStatus =
            s.status === 'limited' || s.status === 'suspended' ? s.status : 'active';
        return {
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `tr-${i}`,
            name: String(s.name || 'Mass transit asset').slice(0, 160),
            address: String(s.address || '').slice(0, 240),
            lat: Number.isFinite(s.lat) ? s.lat : 0,
            lng: Number.isFinite(s.lng) ? s.lng : 0,
            vehiclesDeployed: Math.max(0, Math.floor(Number(s.vehiclesDeployed) || 0)),
            status,
            notes: s.notes != null ? String(s.notes).slice(0, 2000) : undefined,
        };
    });
    return {
        ...p,
        networkId: p.networkId?.trim() ? p.networkId.trim() : 'mock-transit-net-001',
        networkName: p.networkName?.trim() ? p.networkName.trim() : 'Mass transit resource net',
        sites,
    };
}

export function getTransitResourceDeployment(): TransitResourceDeploymentPayload {
    if (!transit) transit = seedTransit();
    transit = normalizeTransitPayload(transit);
    return transit;
}

export function setTransitResourceDeployment(next: TransitResourceDeploymentPayload): TransitResourceDeploymentPayload {
    transit = normalizeTransitPayload(next);
    return transit;
}

function normalizeEnergyPayload(p: EnergyResourceDeploymentPayload): EnergyResourceDeploymentPayload {
    const raw = Array.isArray(p.sites) ? p.sites : [];
    const sites = raw.map((s, i) => {
        const status: EnergyCrewStatus =
            s.status === 'limited' || s.status === 'suspended' ? s.status : 'active';
        return {
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `en-${i}`,
            name: String(s.name || 'Power outage / crew staging').slice(0, 160),
            address: String(s.address || '').slice(0, 240),
            lat: Number.isFinite(s.lat) ? s.lat : 0,
            lng: Number.isFinite(s.lng) ? s.lng : 0,
            crewsDeployed: Math.max(0, Math.floor(Number(s.crewsDeployed) || 0)),
            status,
            notes: s.notes != null ? String(s.notes).slice(0, 2000) : undefined,
        };
    });
    return {
        ...p,
        networkId: p.networkId?.trim() ? p.networkId.trim() : 'mock-energy-net-001',
        networkName: p.networkName?.trim() ? p.networkName.trim() : 'Energy utility net',
        sites,
    };
}

export function getEnergyResourceDeployment(): EnergyResourceDeploymentPayload {
    if (!energy) energy = seedEnergy();
    energy = normalizeEnergyPayload(energy);
    return energy;
}

export function setEnergyResourceDeployment(next: EnergyResourceDeploymentPayload): EnergyResourceDeploymentPayload {
    energy = normalizeEnergyPayload(next);
    return energy;
}

function normalizeGasPayload(p: GasResourceDeploymentPayload): GasResourceDeploymentPayload {
    const raw = Array.isArray(p.sites) ? p.sites : [];
    const sites = raw.map((s, i) => {
        const status: GasCrewStatus =
            s.status === 'limited' || s.status === 'suspended' ? s.status : 'active';
        return {
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `gas-${i}`,
            name: String(s.name || 'Gas leak / crew staging').slice(0, 160),
            address: String(s.address || '').slice(0, 240),
            lat: Number.isFinite(s.lat) ? s.lat : 0,
            lng: Number.isFinite(s.lng) ? s.lng : 0,
            crewsDeployed: Math.max(0, Math.floor(Number(s.crewsDeployed) || 0)),
            status,
            notes: s.notes != null ? String(s.notes).slice(0, 2000) : undefined,
        };
    });
    return {
        ...p,
        networkId: p.networkId?.trim() ? p.networkId.trim() : 'mock-gas-net-001',
        networkName: p.networkName?.trim() ? p.networkName.trim() : 'Gas utility net',
        sites,
    };
}

export function getGasResourceDeployment(): GasResourceDeploymentPayload {
    if (!gas) gas = seedGas();
    gas = normalizeGasPayload(gas);
    return gas;
}

export function setGasResourceDeployment(next: GasResourceDeploymentPayload): GasResourceDeploymentPayload {
    gas = normalizeGasPayload(next);
    return gas;
}

export function recomputeHospitalSummary(payload: HospitalCapacityPayload): HospitalCapacityPayload {
    let totalBeds = 0;
    let occupied = 0;
    let icuTotal = 0;
    let icuOccupied = 0;
    for (const u of payload.units) {
        totalBeds += u.capacity;
        occupied += u.occupied;
        if (u.name.toLowerCase().includes('icu')) {
            icuTotal += u.capacity;
            icuOccupied += u.occupied;
        }
    }
    const icuAvailable = Math.max(0, icuTotal - icuOccupied);
    return {
        ...payload,
        updatedAt: new Date().toISOString(),
        summary: {
            totalBeds,
            occupied,
            available: Math.max(0, totalBeds - occupied),
            icuTotal,
            icuOccupied,
            icuAvailable,
        },
    };
}
