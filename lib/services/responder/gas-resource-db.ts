import { type Model } from 'mongoose';
import ResponderGasDeployment from '@/models/ResponderGasDeployment';
import type { GasCrewAsset, GasCrewStatus, GasResourceDeploymentPayload } from './types';
import { createSiteNetworkResourceDb, type SiteNetworkPayloadBase } from './site-network-resource-db-factory';

type Payload = GasResourceDeploymentPayload & SiteNetworkPayloadBase;

function normalizeSites(raw: unknown[]): GasCrewAsset[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: GasCrewStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `gas-${i}`,
            name: String(o.name || `Gas leak / crew staging ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            crewsDeployed: Math.max(0, Math.floor(Number(o.crewsDeployed) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

const api = createSiteNetworkResourceDb<Payload, GasCrewAsset>({
    Model: ResponderGasDeployment as Model<unknown>,
    networkIdPrefix: 'gas-net',
    defaultNetworkName: 'Gas utility network',
    normalizeSites,
    serializeSite: (s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        crewsDeployed: s.crewsDeployed,
        status: s.status,
        ...(s.notes !== undefined ? { notes: s.notes } : {}),
    }),
});

export const getGasResourceDeploymentForUser = api.getForUser;
export const mergeGasResourceDeploymentForUser = api.mergeForUser;
