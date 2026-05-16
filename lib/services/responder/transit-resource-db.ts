import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderTransitDeployment from '@/models/ResponderTransitDeployment';
import type {
    TransitMassTransitAsset,
    TransitAssetStatus,
    TransitResourceDeploymentPayload,
} from './types';

function newNetworkId(): string {
    return `tr-net-${new mongoose.Types.ObjectId().toString()}`;
}

function normalizeSites(raw: unknown[]): TransitMassTransitAsset[] {
    return raw.map((entry, i) => {
        const o = entry as Record<string, unknown>;
        const status: TransitAssetStatus =
            o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
        return {
            id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `tr-${i}`,
            name: String(o.name || `Mass transit asset ${i + 1}`).slice(0, 160),
            address: String(o.address || '').slice(0, 240),
            lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
            lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
            vehiclesDeployed: Math.max(0, Math.floor(Number(o.vehiclesDeployed) || 0)),
            status,
            notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
        };
    });
}

function docToPayload(doc: {
    networkId: string;
    networkName: string;
    sites: TransitMassTransitAsset[];
    coordinatorNotes?: string;
    source: 'api' | 'mock';
    updatedAt?: Date;
}): TransitResourceDeploymentPayload {
    return {
        networkId: doc.networkId || newNetworkId(),
        networkName: doc.networkName || '',
        updatedAt: (doc.updatedAt || new Date()).toISOString(),
        source: doc.source === 'mock' ? 'mock' : 'api',
        sites: Array.isArray(doc.sites) ? normalizeSites(doc.sites as unknown[]) : [],
        coordinatorNotes: doc.coordinatorNotes || '',
    };
}

export async function getTransitResourceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    defaultNetworkName?: string,
): Promise<TransitResourceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    let doc = await ResponderTransitDeployment.findOne({ ownerUserId: oid }).lean();

    if (!doc) {
        const label = defaultNetworkName?.trim() || 'Mass transit resource network';
        const created = await ResponderTransitDeployment.create({
            ownerUserId: oid,
            licenseId: licenseId && mongoose.Types.ObjectId.isValid(licenseId)
                ? new mongoose.Types.ObjectId(licenseId)
                : null,
            networkId: newNetworkId(),
            networkName: label,
            sites: [],
            coordinatorNotes: '',
            source: 'api',
        });
        doc = created.toObject();
    }

    return docToPayload({
        networkId: doc.networkId,
        networkName: doc.networkName,
        sites: (doc.sites || []) as TransitMassTransitAsset[],
        coordinatorNotes: doc.coordinatorNotes,
        source: doc.source as 'api' | 'mock',
        updatedAt: doc.updatedAt,
    });
}

export async function mergeTransitResourceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    body: Partial<TransitResourceDeploymentPayload>,
    defaultNetworkName?: string,
): Promise<TransitResourceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    const cur = await getTransitResourceDeploymentForUser(userId, licenseId, defaultNetworkName);

    const sites = Array.isArray(body.sites) ? normalizeSites(body.sites as unknown[]) : cur.sites;

    const networkId =
        typeof body.networkId === 'string' && body.networkId.trim()
            ? body.networkId.trim().slice(0, 80)
            : cur.networkId;

    const merged: TransitResourceDeploymentPayload = {
        ...cur,
        networkId,
        networkName:
            typeof body.networkName === 'string' ? body.networkName.slice(0, 200) : cur.networkName,
        sites,
        coordinatorNotes:
            typeof body.coordinatorNotes === 'string'
                ? body.coordinatorNotes.slice(0, 2000)
                : cur.coordinatorNotes,
        updatedAt: new Date().toISOString(),
        source: 'api',
    };

    const licenseOid =
        licenseId && mongoose.Types.ObjectId.isValid(licenseId)
            ? new mongoose.Types.ObjectId(licenseId)
            : null;

    await ResponderTransitDeployment.findOneAndUpdate(
        { ownerUserId: oid },
        {
            $set: {
                networkId: merged.networkId,
                networkName: merged.networkName,
                sites: merged.sites.map((s) => ({
                    id: s.id,
                    name: s.name,
                    address: s.address,
                    lat: s.lat,
                    lng: s.lng,
                    vehiclesDeployed: s.vehiclesDeployed,
                    status: s.status,
                    ...(s.notes !== undefined ? { notes: s.notes } : {}),
                })),
                coordinatorNotes: merged.coordinatorNotes || '',
                source: 'api',
                ...(licenseOid ? { licenseId: licenseOid } : {}),
            },
        },
        { upsert: true, new: true },
    );

    return merged;
}
