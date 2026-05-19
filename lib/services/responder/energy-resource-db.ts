import { type Model } from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderEnergyDeployment from '@/models/ResponderEnergyDeployment';
import type { EnergyCrewAsset, EnergyCrewStatus, EnergyResourceDeploymentPayload } from './types';
import {
    createSiteNetworkResourceDb,
    type SiteNetworkPayloadBase,
} from './site-network-resource-db-factory';

type Payload = EnergyResourceDeploymentPayload & SiteNetworkPayloadBase;

function normalizeSites(raw: unknown[]): EnergyCrewAsset[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: EnergyCrewStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `en-${i}`,
            name: String(o.name || `Power outage / crew staging ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            crewsDeployed: Math.max(0, Math.floor(Number(o.crewsDeployed) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

const api = createSiteNetworkResourceDb<Payload, EnergyCrewAsset>({
    Model: ResponderEnergyDeployment as Model<unknown>,
    networkIdPrefix: 'en-net',
    defaultNetworkName: 'Energy utility network',
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

export const getEnergyResourceDeploymentForUser = api.getForUser;
export const mergeEnergyResourceDeploymentForUser = api.mergeForUser;
