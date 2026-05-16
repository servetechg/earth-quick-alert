import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getTransitResourceDeploymentForUser,
    mergeTransitResourceDeploymentForUser,
    type TransitResourceDeploymentPayload,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('transit');
    if (!g.ok) return g.response;
    const licenseId = g.session.user.licenseId ?? null;
    const rf = String(g.session.user.responderFunction || '');
    const payload = await getTransitResourceDeploymentForUser(g.session.user.id, licenseId, rf);
    return NextResponse.json(payload);
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('transit');
    if (!g.ok) return g.response;

    let body: Partial<TransitResourceDeploymentPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const licenseId = g.session.user.licenseId ?? null;
    const rf = String(g.session.user.responderFunction || '');
    const next = await mergeTransitResourceDeploymentForUser(g.session.user.id, licenseId, body, rf);
    return NextResponse.json(next);
}
