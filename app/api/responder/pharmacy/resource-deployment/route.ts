import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getPharmacyResourceDeployment,
    setPharmacyResourceDeployment,
    type PharmacyResourceDeploymentPayload,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('pharmacy');
    if (!g.ok) return g.response;
    return NextResponse.json(getPharmacyResourceDeployment());
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('pharmacy');
    if (!g.ok) return g.response;

    let body: Partial<PharmacyResourceDeploymentPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const cur = getPharmacyResourceDeployment();

    const sites = Array.isArray(body.sites)
        ? body.sites.map((entry: unknown, i: number) => {
              const o = entry as Record<string, unknown>;
              const st = o.status === 'limited' || o.status === 'closed' ? o.status : 'open';
              return {
                  id: typeof o.id === 'string' ? o.id : `rx-${i}`,
                  name: String(o.name || `Pharmacy site ${i + 1}`).slice(0, 160),
                  address: String(o.address || '').slice(0, 240),
                  lat: Number.isFinite(Number(o.lat)) ? Number(o.lat) : 0,
                  lng: Number.isFinite(Number(o.lng)) ? Number(o.lng) : 0,
                  status: st as 'open' | 'limited' | 'closed',
                  notes: o.notes != null ? String(o.notes).slice(0, 2000) : undefined,
              };
          })
        : cur.sites;

    const next: PharmacyResourceDeploymentPayload = {
        ...cur,
        networkId: typeof body.networkId === 'string' ? body.networkId.slice(0, 80) : cur.networkId,
        networkName: typeof body.networkName === 'string' ? body.networkName.slice(0, 200) : cur.networkName,
        sites,
        coordinatorNotes:
            typeof body.coordinatorNotes === 'string' ? body.coordinatorNotes.slice(0, 2000) : cur.coordinatorNotes,
        updatedAt: new Date().toISOString(),
        source: 'mock',
    };

    setPharmacyResourceDeployment(next);
    return NextResponse.json(next);
}
