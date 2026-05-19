import { type Model } from 'mongoose';
import ResponderNationalGuardDeployment from '@/models/ResponderNationalGuardDeployment';
import type {
    NationalGuardSite,
    NationalGuardSiteStatus,
    NationalGuardResourceDeploymentPayload,
} from './types';
import { createSiteNetworkResourceDb, type SiteNetworkPayloadBase } from './site-network-resource-db-factory';

type Payload = NationalGuardResourceDeploymentPayload & SiteNetworkPayloadBase;

function normalizeSites(raw: unknown[]): NationalGuardSite[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: NationalGuardSiteStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `ng-${i}`,
            name: String(o.name || `Staging area ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            personnelDeployed: Math.max(0, Math.floor(Number(o.personnelDeployed) || 0)),
            vehiclesDeployed: Math.max(0, Math.floor(Number(o.vehiclesDeployed) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

const api = createSiteNetworkResourceDb<Payload, NationalGuardSite>({
    Model: ResponderNationalGuardDeployment as Model<unknown>,
    networkIdPrefix: 'ng-net',
    defaultNetworkName: 'National Guard unit',
    normalizeSites,
    serializeSite: (s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        personnelDeployed: s.personnelDeployed,
        vehiclesDeployed: s.vehiclesDeployed,
        status: s.status,
        ...(s.notes !== undefined ? { notes: s.notes } : {}),
    }),
});

export const getNationalGuardResourceDeploymentForUser = api.getForUser;
export const mergeNationalGuardResourceDeploymentForUser = api.mergeForUser;
