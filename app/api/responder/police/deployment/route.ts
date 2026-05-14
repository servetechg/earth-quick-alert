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

    const next: PoliceDeploymentPayload = {
        ...cur,
        agencyId: typeof body.agencyId === 'string' ? body.agencyId.slice(0, 80) : cur.agencyId,
        agencyName: typeof body.agencyName === 'string' ? body.agencyName.slice(0, 200) : cur.agencyName,
        vehiclesDeployed: Math.max(0, Math.floor(Number(body.vehiclesDeployed ?? cur.vehiclesDeployed))),
        personnelOnDuty: Math.max(0, Math.floor(Number(body.personnelOnDuty ?? cur.personnelOnDuty))),
        incidentOperations,
        stagingAreas,
        commanderNotes:
            typeof body.commanderNotes === 'string' ? body.commanderNotes.slice(0, 2000) : cur.commanderNotes,
        updatedAt: new Date().toISOString(),
        source: 'mock',
    };

    setPoliceDeployment(next);
    return NextResponse.json(next);
}
