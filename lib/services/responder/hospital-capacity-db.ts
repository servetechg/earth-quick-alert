import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import ResponderHospitalCapacity from '@/models/ResponderHospitalCapacity';
import type { HospitalCapacityPayload, HospitalUnitRow } from './types';
import { seedHospital } from './mock-seeds';
import { recomputeHospitalSummary } from './hospital-summary';

function newFacilityId(): string {
    return `fac-${new mongoose.Types.ObjectId().toString()}`;
}

function docToPayload(doc: {
    facilityId: string;
    facilityName: string;
    notes?: string;
    units: (HospitalUnitRow & { unitType?: string })[];
    source: 'api' | 'mock';
    updatedAt?: Date;
}): HospitalCapacityPayload {
    const units: HospitalUnitRow[] = (doc.units || []).map((u) => {
        const row: HospitalUnitRow = {
            id: u.id,
            name: u.name,
            capacity: u.capacity,
            occupied: u.occupied,
        };
        if (u.unitType === 'icu' || u.unitType === 'medsurg') {
            row.unitType = u.unitType;
        }
        return row;
    });
    const base: HospitalCapacityPayload = {
        facilityId: doc.facilityId,
        facilityName: doc.facilityName || 'Facility',
        updatedAt: (doc.updatedAt || new Date()).toISOString(),
        source: doc.source === 'mock' ? 'mock' : 'api',
        summary: {
            totalBeds: 0,
            occupied: 0,
            available: 0,
            icuTotal: 0,
            icuOccupied: 0,
            icuAvailable: 0,
        },
        units,
        notes: doc.notes || '',
    };
    return recomputeHospitalSummary(base);
}

/** Merge incoming PUT units with existing rows so optional fields like `unitType` are preserved. */
export function normalizeHospitalUnitsFromPartial(
    partialUnits: unknown,
    cur: HospitalCapacityPayload,
): HospitalUnitRow[] {
    if (!Array.isArray(partialUnits)) return cur.units;
    const prevById = new Map(cur.units.map((u) => [u.id, u]));
    return partialUnits.map((u: HospitalUnitRow, i: number) => {
        const id = typeof u.id === 'string' ? u.id : `u-${i}`;
        const prev = prevById.get(id);
        const rawType = (u as { unitType?: string }).unitType;
        const unitType =
            rawType === 'icu' || rawType === 'medsurg'
                ? rawType
                : prev?.unitType === 'icu' || prev?.unitType === 'medsurg'
                  ? prev.unitType
                  : undefined;
        return {
            id,
            name: String(u.name || `Unit ${i + 1}`).slice(0, 120),
            capacity: Math.max(0, Math.floor(Number(u.capacity) || 0)),
            occupied: Math.max(0, Math.floor(Number(u.occupied) || 0)),
            ...(unitType ? { unitType } : {}),
        };
    });
}

export async function getHospitalCapacityForUser(
    userId: string,
    licenseId: string | null | undefined,
): Promise<HospitalCapacityPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    let doc = await ResponderHospitalCapacity.findOne({ ownerUserId: oid }).lean();

    if (!doc) {
        const seed = seedHospital();
        const created = await ResponderHospitalCapacity.create({
            ownerUserId: oid,
            licenseId: licenseId ? new mongoose.Types.ObjectId(licenseId) : null,
            facilityId: seed.facilityId.startsWith('mock-') ? newFacilityId() : seed.facilityId,
            facilityName: seed.facilityName,
            notes: seed.notes || '',
            units: seed.units.map((u) => ({
                id: u.id,
                name: u.name,
                capacity: u.capacity,
                occupied: u.occupied,
                unitType: u.name.toLowerCase().includes('icu') ? ('icu' as const) : ('medsurg' as const),
            })),
            source: 'api',
        });
        doc = created.toObject();
    }

    return docToPayload({
        facilityId: doc.facilityId,
        facilityName: doc.facilityName,
        notes: doc.notes,
        units: (doc.units || []) as HospitalUnitRow[],
        source: doc.source as 'api' | 'mock',
        updatedAt: doc.updatedAt,
    });
}

export async function mergeHospitalCapacityForUser(
    userId: string,
    partial: Partial<Pick<HospitalCapacityPayload, 'facilityName' | 'notes' | 'units'>>,
    licenseId?: string | null,
): Promise<HospitalCapacityPayload> {
    await connectDB();
    const oid = new mongoose.Types.ObjectId(userId);
    const cur = await getHospitalCapacityForUser(userId, licenseId);

    const units: HospitalUnitRow[] = Array.isArray(partial.units)
        ? normalizeHospitalUnitsFromPartial(partial.units, cur)
        : cur.units;

    const merged = recomputeHospitalSummary({
        ...cur,
        facilityName:
            typeof partial.facilityName === 'string'
                ? partial.facilityName.slice(0, 200)
                : cur.facilityName,
        notes: typeof partial.notes === 'string' ? partial.notes.slice(0, 2000) : cur.notes,
        units,
        source: 'api',
    });

    const licenseOid =
        licenseId && mongoose.Types.ObjectId.isValid(licenseId)
            ? new mongoose.Types.ObjectId(licenseId)
            : null;

    await ResponderHospitalCapacity.findOneAndUpdate(
        { ownerUserId: oid },
        {
            $set: {
                facilityName: merged.facilityName,
                notes: merged.notes || '',
                units: merged.units.map((u) => ({
                    id: u.id,
                    name: u.name,
                    capacity: u.capacity,
                    occupied: u.occupied,
                    unitType: u.unitType || '',
                })),
                source: 'api',
                ...(licenseOid ? { licenseId: licenseOid } : {}),
            },
        },
        { upsert: true, new: true },
    );

    return merged;
}
