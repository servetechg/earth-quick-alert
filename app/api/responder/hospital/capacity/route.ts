import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getHospitalCapacityForUser,
    mergeHospitalCapacityForUser,
    normalizeHospitalUnitsFromPartial,
    type HospitalCapacityPayload,
    type HospitalUnitRow,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('hospital');
    if (!g.ok) return g.response;
    const licenseId = g.session.user.licenseId ?? null;
    const payload = await getHospitalCapacityForUser(g.session.user.id, licenseId);
    return NextResponse.json(payload);
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('hospital');
    if (!g.ok) return g.response;

    let body: Partial<HospitalCapacityPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const licenseId = g.session.user.licenseId ?? null;
    const cur = await getHospitalCapacityForUser(g.session.user.id, licenseId);
    const units: HospitalUnitRow[] = normalizeHospitalUnitsFromPartial(body.units, cur);

    for (const u of units) {
        if (u.occupied > u.capacity) {
            return NextResponse.json(
                { error: `Occupied cannot exceed capacity for "${u.name}"` },
                { status: 400 },
            );
        }
    }

    const merged = await mergeHospitalCapacityForUser(
        g.session.user.id,
        {
            facilityName: typeof body.facilityName === 'string' ? body.facilityName.slice(0, 200) : cur.facilityName,
            notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : cur.notes,
            units,
        },
        licenseId,
    );

    return NextResponse.json(merged);
}
