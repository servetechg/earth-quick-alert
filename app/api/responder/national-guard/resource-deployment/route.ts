import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getNationalGuardResourceDeploymentForUser,
    mergeNationalGuardResourceDeploymentForUser,
    type NationalGuardResourceDeploymentPayload,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('national-guard');
    if (!g.ok) return g.response;
    const licenseId = g.session.user.licenseId ?? null;
    const rf = String(g.session.user.responderFunction || '');
    const payload = await getNationalGuardResourceDeploymentForUser(g.session.user.id, licenseId, rf);
    return NextResponse.json(payload);
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('national-guard');
    if (!g.ok) return g.response;

    let body: Partial<NationalGuardResourceDeploymentPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const licenseId = g.session.user.licenseId ?? null;
    const rf = String(g.session.user.responderFunction || '');
    const next = await mergeNationalGuardResourceDeploymentForUser(g.session.user.id, licenseId, body, rf);
    return NextResponse.json(next);
}
