import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getHospitalCapacity,
    setHospitalCapacity,
    recomputeHospitalSummary,
    type HospitalCapacityPayload,
    type HospitalUnitRow,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('hospital');
    if (!g.ok) return g.response;
    return NextResponse.json(getHospitalCapacity());
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

    const cur = getHospitalCapacity();
    const units: HospitalUnitRow[] = Array.isArray(body.units)
        ? body.units.map((u: HospitalUnitRow, i: number) => ({
              id: typeof u.id === 'string' ? u.id : `u-${i}`,
              name: String(u.name || `Unit ${i + 1}`).slice(0, 120),
              capacity: Math.max(0, Math.floor(Number(u.capacity) || 0)),
              occupied: Math.max(0, Math.floor(Number(u.occupied) || 0)),
          }))
        : cur.units;

    for (const u of units) {
        if (u.occupied > u.capacity) {
            return NextResponse.json(
                { error: `Occupied cannot exceed capacity for "${u.name}"` },
                { status: 400 },
            );
        }
    }

    const merged: HospitalCapacityPayload = recomputeHospitalSummary({
        ...cur,
        facilityName: typeof body.facilityName === 'string' ? body.facilityName.slice(0, 200) : cur.facilityName,
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : cur.notes,
        units,
        source: 'mock',
    });

    setHospitalCapacity(merged);
    return NextResponse.json(merged);
}
