import { type Model } from 'mongoose';
import ResponderElectricDeployment from '@/models/ResponderElectricDeployment';
import type {
    ElectricCrewAsset,
    ElectricCrewStatus,
    ElectricResourceDeploymentPayload,
} from './types';
import { createSiteNetworkResourceDb, type SiteNetworkPayloadBase } from './site-network-resource-db-factory';

type Payload = ElectricResourceDeploymentPayload & SiteNetworkPayloadBase;

function normalizeSites(raw: unknown[]): ElectricCrewAsset[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: ElectricCrewStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `elec-${i}`,
            name: String(o.name || `Electric outage / crew staging ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            vehiclesDeployed: Math.max(0, Math.floor(Number(o.vehiclesDeployed) || 0)),
            crewsDeployed: Math.max(0, Math.floor(Number(o.crewsDeployed) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

const api = createSiteNetworkResourceDb<Payload, ElectricCrewAsset>({
    Model: ResponderElectricDeployment as Model<unknown>,
    networkIdPrefix: 'electric-net',
    defaultNetworkName: 'Electric utility network',
    normalizeSites,
    serializeSite: (s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        vehiclesDeployed: s.vehiclesDeployed,
        crewsDeployed: s.crewsDeployed,
        status: s.status,
        ...(s.notes !== undefined ? { notes: s.notes } : {}),
    }),
});

export const getElectricResourceDeploymentForUser = api.getForUser;
export const mergeElectricResourceDeploymentForUser = api.mergeForUser;
