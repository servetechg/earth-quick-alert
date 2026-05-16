import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getElectricResourceDeployment,
    setElectricResourceDeployment,
    type ElectricResourceDeploymentPayload,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('electric');
    if (!g.ok) return g.response;
    return NextResponse.json(getElectricResourceDeployment());
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('electric');
    if (!g.ok) return g.response;

    let body: Partial<ElectricResourceDeploymentPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const cur = getElectricResourceDeployment();

    const sites = Array.isArray(body.sites)
        ? body.sites.map((entry: unknown, i: number) => {
              const o = entry as Record<string, unknown>;
              const st =
                  o.status === 'limited' || o.status === 'suspended' ? o.status : 'active';
              return {
                  id: typeof o.id === 'string' ? o.id : `elec-${i}`,
                  name: String(o.name || `Electric outage site ${i + 1}`).slice(0, 160),
                  address: String(o.address || '').slice(0, 240),
                  lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
                  lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
                  vehiclesDeployed: Math.max(0, Math.floor(Number(o.vehiclesDeployed) || 0)),
                  crewsDeployed: Math.max(0, Math.floor(Number(o.crewsDeployed) || 0)),
                  status: st as 'active' | 'limited' | 'suspended',
                  notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
              };
          })
        : cur.sites;

    const next: ElectricResourceDeploymentPayload = {
        ...cur,
        networkId: typeof body.networkId === 'string' ? body.networkId.slice(0, 80) : cur.networkId,
        networkName: typeof body.networkName === 'string' ? body.networkName.slice(0, 200) : cur.networkName,
        sites,
        coordinatorNotes:
            typeof body.coordinatorNotes === 'string' ? body.coordinatorNotes.slice(0, 2000) : cur.coordinatorNotes,
        updatedAt: new Date().toISOString(),
        source: 'mock',
    };

    setElectricResourceDeployment(next);
    return NextResponse.json(next);
}
