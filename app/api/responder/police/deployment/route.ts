import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import { getPoliceDeployment, setPoliceDeployment, type PoliceDeploymentPayload } from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('police');
    if (!g.ok) return g.response;
    return NextResponse.json(getPoliceDeployment());
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('police');
    if (!g.ok) return g.response;

    let body: Partial<PoliceDeploymentPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const cur = getPoliceDeployment();
    const stagingAreas = Array.isArray(body.stagingAreas)
        ? body.stagingAreas.map((s: any, i: number) => ({
              id: typeof s.id === 'string' ? s.id : `s-${i}`,
              name: String(s.name || `Staging ${i + 1}`).slice(0, 120),
              address: String(s.address || '').slice(0, 200),
              units: Math.max(0, Math.floor(Number(s.units) || 0)),
          }))
        : cur.stagingAreas;

    const activeBeats = Array.isArray(body.activeBeats)
        ? body.activeBeats.map((b: any, i: number) => ({
              id: typeof b.id === 'string' ? b.id : `b-${i}`,
              label: String(b.label || `Beat ${i + 1}`).slice(0, 120),
              status: (['routine', 'elevated', 'critical'] as const).includes(b.status)
                  ? b.status
                  : 'routine',
          }))
        : cur.activeBeats;

    const next: PoliceDeploymentPayload = {
        ...cur,
        agencyName: typeof body.agencyName === 'string' ? body.agencyName.slice(0, 200) : cur.agencyName,
        vehiclesDeployed: Math.max(0, Math.floor(Number(body.vehiclesDeployed ?? cur.vehiclesDeployed))),
        personnelOnDuty: Math.max(0, Math.floor(Number(body.personnelOnDuty ?? cur.personnelOnDuty))),
        stagingAreas,
        activeBeats,
        commanderNotes:
            typeof body.commanderNotes === 'string' ? body.commanderNotes.slice(0, 2000) : cur.commanderNotes,
        updatedAt: new Date().toISOString(),
        source: 'mock',
    };

    setPoliceDeployment(next);
    return NextResponse.json(next);
}
