import { type Model } from 'mongoose';
import ResponderFoodLogisticsDeployment from '@/models/ResponderFoodLogisticsDeployment';
import type {
    FoodLogisticsSite,
    FoodLogisticsSiteStatus,
    FoodLogisticsResourceDeploymentPayload,
} from './types';
import { createSiteNetworkResourceDb, type SiteNetworkPayloadBase } from './site-network-resource-db-factory';

type Payload = FoodLogisticsResourceDeploymentPayload & SiteNetworkPayloadBase;

function normalizeSites(raw: unknown[]): FoodLogisticsSite[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: FoodLogisticsSiteStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `food-${i}`,
            name: String(o.name || `Distribution site ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            volunteersDeployed: Math.max(0, Math.floor(Number(o.volunteersDeployed) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

const api = createSiteNetworkResourceDb<Payload, FoodLogisticsSite>({
    Model: ResponderFoodLogisticsDeployment as Model<unknown>,
    networkIdPrefix: 'food-net',
    defaultNetworkName: 'Food & supply logistics network',
    normalizeSites,
    serializeSite: (s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        volunteersDeployed: s.volunteersDeployed,
        status: s.status,
        ...(s.notes !== undefined ? { notes: s.notes } : {}),
    }),
});

export const getFoodLogisticsResourceDeploymentForUser = api.getForUser;
export const mergeFoodLogisticsResourceDeploymentForUser = api.mergeForUser;
