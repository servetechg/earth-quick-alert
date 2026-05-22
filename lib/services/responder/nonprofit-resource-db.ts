import { type Model } from 'mongoose';
import ResponderNonprofitDeployment from '@/models/ResponderNonprofitDeployment';
import type {
    NonprofitSite,
    NonprofitSiteKind,
    NonprofitSiteStatus,
    NonprofitResourceDeploymentPayload,
} from './types';
import { createSiteNetworkResourceDb, type SiteNetworkPayloadBase } from './site-network-resource-db-factory';

type Payload = NonprofitResourceDeploymentPayload & SiteNetworkPayloadBase;

function normalizeSiteKind(raw: unknown): NonprofitSiteKind {
    if (raw === 'shelter' || raw === 'volunteer') return raw;
    return 'network';
}

function normalizeSites(raw: unknown[]): NonprofitSite[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: NonprofitSiteStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `nonprofit-${i}`,
            name: String(o.name || `Response location ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            siteKind: normalizeSiteKind(o.siteKind),
            volunteersDeployed: Math.max(0, Math.floor(Number(o.volunteersDeployed) || 0)),
            shelterCapacity: Math.max(0, Math.floor(Number(o.shelterCapacity) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

const api = createSiteNetworkResourceDb<Payload, NonprofitSite>({
    Model: ResponderNonprofitDeployment as Model<unknown>,
    networkIdPrefix: 'nonprofit-net',
    defaultNetworkName: 'Disaster response network',
    normalizeSites,
    serializeSite: (s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        siteKind: s.siteKind,
        volunteersDeployed: s.volunteersDeployed,
        shelterCapacity: s.shelterCapacity,
        status: s.status,
        ...(s.notes !== undefined ? { notes: s.notes } : {}),
    }),
});

export const getNonprofitResourceDeploymentForUser = api.getForUser;
export const mergeNonprofitResourceDeploymentForUser = api.mergeForUser;
