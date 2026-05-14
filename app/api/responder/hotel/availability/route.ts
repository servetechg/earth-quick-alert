import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import { getHotelAvailability, setHotelAvailability, type HotelAvailabilityPayload } from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('hotel');
    if (!g.ok) return g.response;
    return NextResponse.json(getHotelAvailability());
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('hotel');
    if (!g.ok) return g.response;

    let body: Partial<HotelAvailabilityPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const cur = getHotelAvailability();
    const roomsTotal = Math.max(0, Math.floor(Number(body.roomsTotal ?? cur.roomsTotal)));
    let roomsOccupied = Math.max(0, Math.floor(Number(body.roomsOccupied ?? cur.roomsOccupied)));
    let roomsHeldForEm = Math.max(0, Math.floor(Number(body.roomsHeldForEm ?? cur.roomsHeldForEm)));
    let adaRoomsAvailable = Math.max(0, Math.floor(Number(body.adaRoomsAvailable ?? cur.adaRoomsAvailable)));

    if (roomsOccupied + roomsHeldForEm > roomsTotal) {
        return NextResponse.json({ error: 'Occupied + EM hold cannot exceed total rooms' }, { status: 400 });
    }
    if (adaRoomsAvailable > roomsTotal) {
        adaRoomsAvailable = roomsTotal;
    }

    const next: HotelAvailabilityPayload = {
        ...cur,
        propertyName: typeof body.propertyName === 'string' ? body.propertyName.slice(0, 200) : cur.propertyName,
        roomsTotal,
        roomsOccupied,
        roomsHeldForEm,
        adaRoomsAvailable,
        checkInNotes: typeof body.checkInNotes === 'string' ? body.checkInNotes.slice(0, 2000) : cur.checkInNotes,
        updatedAt: new Date().toISOString(),
        source: 'mock',
    };

    setHotelAvailability(next);
    return NextResponse.json(next);
}
