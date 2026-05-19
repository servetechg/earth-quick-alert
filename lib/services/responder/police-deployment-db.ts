import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderPoliceDeployment from '@/models/ResponderPoliceDeployment';
import type {
    PoliceDeploymentPayload,
    PoliceIncidentOperation,
    PoliceStagingArea,
} from './types';

function newAgencyId(): string {
    return `ag-${new mongoose.Types.ObjectId().toString()}`;
}

function docToPayload(doc: {
    agencyId: string;
    agencyName: string;
    vehiclesDeployed: number;
    personnelOnDuty: number;
    incidentOperations: PoliceIncidentOperation[];
    stagingAreas: PoliceStagingArea[];
    commanderNotes?: string;
    source: 'api' | 'mock';
    updatedAt?: Date;
}): PoliceDeploymentPayload {
    return {
        agencyId: doc.agencyId || newAgencyId(),
        agencyName: doc.agencyName || '',
        updatedAt: (doc.updatedAt || new Date()).toISOString(),
        source: doc.source === 'mock' ? 'mock' : 'api',
        vehiclesDeployed: doc.vehiclesDeployed ?? 0,
        personnelOnDuty: doc.personnelOnDuty ?? 0,
        incidentOperations: Array.isArray(doc.incidentOperations) ? doc.incidentOperations : [],
        stagingAreas: Array.isArray(doc.stagingAreas) ? doc.stagingAreas : [],
        commanderNotes: doc.commanderNotes || '',
    };
}

export async function getPoliceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    defaultAgencyName?: string,
): Promise<PoliceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    let doc = await ResponderPoliceDeployment.findOne({ ownerUserId: oid }).lean();

    if (!doc) {
        const label = defaultAgencyName?.trim() || 'Agency';
        const created = await ResponderPoliceDeployment.create({
            ownerUserId: oid,
            licenseId: licenseId && mongoose.Types.ObjectId.isValid(licenseId)
                ? new mongoose.Types.ObjectId(licenseId)
                : null,
            agencyId: newAgencyId(),
            agencyName: label,
            vehiclesDeployed: 0,
            personnelOnDuty: 0,
            incidentOperations: [],
            stagingAreas: [],
            commanderNotes: '',
            source: 'api',
        });
        doc = created.toObject();
    }

    return docToPayload({
        agencyId: doc.agencyId,
        agencyName: doc.agencyName,
        vehiclesDeployed: doc.vehiclesDeployed,
        personnelOnDuty: doc.personnelOnDuty,
        incidentOperations: (doc.incidentOperations || []) as PoliceIncidentOperation[],
        stagingAreas: (doc.stagingAreas || []) as PoliceStagingArea[],
        commanderNotes: doc.commanderNotes,
        source: doc.source as 'api' | 'mock',
        updatedAt: doc.updatedAt,
    });
}

export async function mergePoliceDeploymentForUser(
    userId: string,
    licenseId: string | null | undefined,
    body: Partial<PoliceDeploymentPayload>,
    defaultAgencyName?: string,
): Promise<PoliceDeploymentPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    const cur = await getPoliceDeploymentForUser(userId, licenseId, defaultAgencyName);

    const incidentOperations = Array.isArray(body.incidentOperations)
        ? body.incidentOperations.map((entry: unknown, i: number) => {
              const o = entry as Record<string, unknown>;
              return {
                  id: typeof o.id === 'string' ? o.id : `io-${i}`,
                  incidentName: String(o.incidentName || `Incident ${i + 1}`).slice(0, 200),
                  teamsDeployed: Math.max(0, Math.floor(Number(o.teamsDeployed) || 0)),
                  operationSummary: String(o.operationSummary ?? '').slice(0, 2000),
              };
          })
        : cur.incidentOperations;

    const stagingAreas = Array.isArray(body.stagingAreas)
        ? body.stagingAreas.map((entry: unknown, i: number) => {
              const s = entry as Record<string, unknown>;
              return {
                  id: typeof s.id === 'string' ? s.id : `s-${i}`,
                  name: String(s.name || `Staging ${i + 1}`).slice(0, 120),
                  address: String(s.address || '').slice(0, 200),
                  units: Math.max(0, Math.floor(Number(s.units) || 0)),
              };
          })
        : cur.stagingAreas;

    const agencyId =
        typeof body.agencyId === 'string' && body.agencyId.trim()
            ? body.agencyId.trim().slice(0, 80)
            : cur.agencyId?.trim() || newAgencyId();

    const merged: PoliceDeploymentPayload = {
        ...cur,
        agencyId,
        agencyName:
            typeof body.agencyName === 'string' ? body.agencyName.slice(0, 200) : cur.agencyName,
        vehiclesDeployed: Math.max(
            0,
            Math.floor(Number(body.vehiclesDeployed ?? cur.vehiclesDeployed)),
        ),
        personnelOnDuty: Math.max(
            0,
            Math.floor(Number(body.personnelOnDuty ?? cur.personnelOnDuty)),
        ),
        incidentOperations,
        stagingAreas,
        commanderNotes:
            typeof body.commanderNotes === 'string'
                ? body.commanderNotes.slice(0, 2000)
                : cur.commanderNotes,
        updatedAt: new Date().toISOString(),
        source: 'api',
    };

    const licenseOid =
        licenseId && mongoose.Types.ObjectId.isValid(licenseId)
            ? new mongoose.Types.ObjectId(licenseId)
            : null;

    await ResponderPoliceDeployment.findOneAndUpdate(
        { ownerUserId: oid },
        {
            $set: {
                agencyId: merged.agencyId,
                agencyName: merged.agencyName,
                vehiclesDeployed: merged.vehiclesDeployed,
                personnelOnDuty: merged.personnelOnDuty,
                incidentOperations: merged.incidentOperations,
                stagingAreas: merged.stagingAreas,
                commanderNotes: merged.commanderNotes || '',
                source: 'api',
                ...(licenseOid ? { licenseId: licenseOid } : {}),
            },
        },
        { upsert: true, new: true },
    );

    return merged;
}
