import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderFederalDeployment from '@/models/ResponderFederalDeployment';
import type { FederalResourceDeploymentPayload, FederalStagingArea, FederalSiteStatus } from './types';

function docToPayload(doc: {
    jurisdictionName: string;
    totalPersonnelDeployed: number;
    stagingAreas: FederalStagingArea[];
    source: 'api' | 'mock';
    updatedAt?: Date;
}): FederalResourceDeploymentPayload {
    return {
        jurisdictionName: doc.jurisdictionName || '',
        updatedAt: (doc.updatedAt || new Date()).toISOString(),
        source: doc.source === 'mock' ? 'mock' : 'api',
        totalPersonnelDeployed: doc.totalPersonnelDeployed ?? 0,
        stagingAreas: Array.isArray(doc.stagingAreas) ? doc.stagingAreas : [],
    };
}

export async function getFederalResourceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    defaultJurisdictionName?: string,
): Promise<FederalResourceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    let doc = await ResponderFederalDeployment.findOne({ ownerUserId: oid }).lean();

    if (!doc) {
        const label = defaultJurisdictionName?.trim() || 'Federal jurisdiction';
        const created = await ResponderFederalDeployment.create({
            ownerUserId: oid,
            licenseId:
                licenseId && mongoose.Types.ObjectId.isValid(licenseId)
                    ? new mongoose.Types.ObjectId(licenseId)
                    : null,
            jurisdictionName: label,
            totalPersonnelDeployed: 0,
            stagingAreas: [],
            source: 'api',
        });
        doc = created.toObject();
    }

    return docToPayload({
        jurisdictionName: doc.jurisdictionName,
        totalPersonnelDeployed: doc.totalPersonnelDeployed,
        stagingAreas: (doc.stagingAreas || []) as FederalStagingArea[],
        source: doc.source as 'api' | 'mock',
        updatedAt: doc.updatedAt,
    });
}

export async function mergeFederalResourceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    body: Partial<FederalResourceDeploymentPayload>,
    defaultJurisdictionName?: string,
): Promise<FederalResourceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    const cur = await getFederalResourceDeploymentForUser(userId, licenseId, defaultJurisdictionName);

    const stagingAreas = Array.isArray(body.stagingAreas)
        ? body.stagingAreas.map((entry: unknown, i: number) => {
              const s = entry as Record<string, unknown>;
              const status = s.status as FederalSiteStatus;
              const validStatus =
                  status === 'active' || status === 'standby' || status === 'demobilized' ? status : 'standby';
              return {
                  id: typeof s.id === 'string' ? s.id : `fed-${i}`,
                  location: String(s.location || `Staging ${i + 1}`).slice(0, 200),
                  personnelCount: Math.max(0, Math.floor(Number(s.personnelCount) || 0)),
                  vehicleCount: Math.max(0, Math.floor(Number(s.vehicleCount) || 0)),
                  status: validStatus,
                  notes: String(s.notes ?? '').slice(0, 2000),
              };
          })
        : cur.stagingAreas;

    const totalPersonnelDeployed =
        body.totalPersonnelDeployed !== undefined
            ? Math.max(0, Math.floor(Number(body.totalPersonnelDeployed) || 0))
            : stagingAreas.reduce((sum, area) => sum + area.personnelCount, 0);

    const merged: FederalResourceDeploymentPayload = {
        ...cur,
        jurisdictionName:
            typeof body.jurisdictionName === 'string'
                ? body.jurisdictionName.slice(0, 200)
                : cur.jurisdictionName,
        totalPersonnelDeployed,
        stagingAreas,
        updatedAt: new Date().toISOString(),
        source: 'api',
    };

    const licenseOid =
        licenseId && mongoose.Types.ObjectId.isValid(licenseId)
            ? new mongoose.Types.ObjectId(licenseId)
            : null;

    await ResponderFederalDeployment.findOneAndUpdate(
        { ownerUserId: oid },
        {
            $set: {
                jurisdictionName: merged.jurisdictionName,
                totalPersonnelDeployed: merged.totalPersonnelDeployed,
                stagingAreas: merged.stagingAreas,
                source: 'api',
                ...(licenseOid ? { licenseId: licenseOid } : {}),
            },
        },
        { upsert: true, new: true },
    );

    return merged;
}
