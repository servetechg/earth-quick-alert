import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderPharmacyDeployment from '@/models/ResponderPharmacyDeployment';
import type {
    PharmacyPopUpSite,
    PharmacyResourceDeploymentPayload,
    PharmacySiteStatus,
} from './types';

function newNetworkId(): string {
    return `rx-net-${new mongoose.Types.ObjectId().toString()}`;
}

function normalizeSites(raw: unknown[]): PharmacyPopUpSite[] {
    return raw.map((entry, i) => {
        const s = entry as Record<string, unknown>;
        const status: PharmacySiteStatus =
            s.status === 'limited' || s.status === 'closed' ? s.status : 'open';
        return {
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `rx-${i}`,
            name: String(s.name || `Pharmacy site ${i + 1}`).slice(0, 160),
            address: String(s.address || '').slice(0, 240),
            lat: Number.isFinite(Number(s.lat)) ? Number(s.lat) : 0,
            lng: Number.isFinite(Number(s.lng)) ? Number(s.lng) : 0,
            status,
            notes: s.notes != null ? String(s.notes).slice(0, 2000) : undefined,
        };
    });
}

function docToPayload(doc: {
    networkId: string;
    networkName: string;
    sites: PharmacyPopUpSite[];
    coordinatorNotes?: string;
    source: 'api' | 'mock';
    updatedAt?: Date;
}): PharmacyResourceDeploymentPayload {
    return {
        networkId: doc.networkId || newNetworkId(),
        networkName: doc.networkName || '',
        updatedAt: (doc.updatedAt || new Date()).toISOString(),
        source: doc.source === 'mock' ? 'mock' : 'api',
        sites: Array.isArray(doc.sites) ? normalizeSites(doc.sites as unknown[]) : [],
        coordinatorNotes: doc.coordinatorNotes || '',
    };
}

export async function getPharmacyResourceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    defaultNetworkName?: string,
): Promise<PharmacyResourceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    let doc = await ResponderPharmacyDeployment.findOne({ ownerUserId: oid }).lean();

    if (!doc) {
        const label = defaultNetworkName?.trim() || 'Pharmacy resource network';
        const created = await ResponderPharmacyDeployment.create({
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
        sites: (doc.sites || []) as PharmacyPopUpSite[],
        coordinatorNotes: doc.coordinatorNotes,
        source: doc.source as 'api' | 'mock',
        updatedAt: doc.updatedAt,
    });
}

export async function mergePharmacyResourceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    body: Partial<PharmacyResourceDeploymentPayload>,
    defaultNetworkName?: string,
): Promise<PharmacyResourceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    const cur = await getPharmacyResourceDeploymentForUser(userId, licenseId, defaultNetworkName);

    const sites = Array.isArray(body.sites) ? normalizeSites(body.sites as unknown[]) : cur.sites;

    const networkId =
        typeof body.networkId === 'string' && body.networkId.trim()
            ? body.networkId.trim().slice(0, 80)
            : cur.networkId;

    const merged: PharmacyResourceDeploymentPayload = {
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

    await ResponderPharmacyDeployment.findOneAndUpdate(
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
