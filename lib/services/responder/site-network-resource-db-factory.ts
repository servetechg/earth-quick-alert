import mongoose, { type Model } from 'mongoose';
import connectDB from '@/lib/mongodb';
import type { DataSourceBadge } from './types';

export type SiteNetworkPayloadBase = {
    networkId: string;
    networkName: string;
    updatedAt: string;
    source: DataSourceBadge;
    sites: unknown[];
    coordinatorNotes?: string;
};

type SiteNetworkDoc = {
    networkId: string;
    networkName: string;
    sites: unknown[];
    coordinatorNotes?: string;
    source: 'api' | 'mock';
    updatedAt?: Date;
};

export function createSiteNetworkResourceDb<TPayload extends SiteNetworkPayloadBase, TSite>(config: {
    Model: Model<unknown>;
    networkIdPrefix: string;
    defaultNetworkName: string;
    normalizeSites: (raw: unknown[]) => TSite[];
    serializeSite: (site: TSite) => Record<string, unknown>;
}) {
    function newNetworkId(): string {
        return `${config.networkIdPrefix}-${new mongoose.Types.ObjectId().toString()}`;
    }

    function docToPayload(doc: SiteNetworkDoc): TPayload {
        return {
            networkId: doc.networkId || newNetworkId(),
            networkName: doc.networkName || '',
            updatedAt: (doc.updatedAt || new Date()).toISOString(),
            source: doc.source === 'mock' ? 'mock' : 'api',
            sites: Array.isArray(doc.sites) ? config.normalizeSites(doc.sites as unknown[]) : [],
            coordinatorNotes: doc.coordinatorNotes || '',
        } as TPayload;
    }

    async function getForUser(
        userId: string,
        licenseId: string | null | undefined,
        defaultNetworkName?: string,
    ): Promise<TPayload> {
        await connectDB();
        const oid = new mongoose.Types.ObjectId(userId);
        let doc = await config.Model.findOne({ ownerUserId: oid }).lean();

        if (!doc) {
            const label = defaultNetworkName?.trim() || config.defaultNetworkName;
            const created = await config.Model.create({
                ownerUserId: oid,
                licenseId:
                    licenseId && mongoose.Types.ObjectId.isValid(licenseId)
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

        return docToPayload(doc as SiteNetworkDoc);
    }

    async function mergeForUser(
        userId: string,
        licenseId: string | null | undefined,
        body: Partial<TPayload>,
        defaultNetworkName?: string,
    ): Promise<TPayload> {
        await connectDB();
        const oid = new mongoose.Types.ObjectId(userId);
        const cur = await getForUser(userId, licenseId, defaultNetworkName);

        const sites = Array.isArray(body.sites)
            ? config.normalizeSites(body.sites as unknown[])
            : (cur.sites as TSite[]);

        const networkId =
            typeof body.networkId === 'string' && body.networkId.trim()
                ? body.networkId.trim().slice(0, 80)
                : cur.networkId;

        const merged = {
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
            source: 'api' as const,
        } as TPayload;

        const licenseOid =
            licenseId && mongoose.Types.ObjectId.isValid(licenseId)
                ? new mongoose.Types.ObjectId(licenseId)
                : null;

        await config.Model.findOneAndUpdate(
            { ownerUserId: oid },
            {
                $set: {
                    networkId: merged.networkId,
                    networkName: merged.networkName,
                    sites: (merged.sites as TSite[]).map(config.serializeSite),
                    coordinatorNotes: merged.coordinatorNotes || '',
                    source: 'api',
                    ...(licenseOid ? { licenseId: licenseOid } : {}),
                },
            },
            { upsert: true, new: true },
        );

        return merged;
    }

    return { getForUser, mergeForUser };
}
