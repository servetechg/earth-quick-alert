import { NextRequest, NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import {
    getFoodLogisticsResourceDeploymentForUser,
    mergeFoodLogisticsResourceDeploymentForUser,
    type FoodLogisticsResourceDeploymentPayload,
} from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder('food-logistics');
    if (!g.ok) return g.response;
    const licenseId = g.session.user.licenseId ?? null;
    const rf = String(g.session.user.responderFunction || '');
    const payload = await getFoodLogisticsResourceDeploymentForUser(g.session.user.id, licenseId, rf);
    return NextResponse.json(payload);
}

export async function PUT(req: NextRequest) {
    const g = await gateResponder('food-logistics');
    if (!g.ok) return g.response;

    let body: Partial<FoodLogisticsResourceDeploymentPayload>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const licenseId = g.session.user.licenseId ?? null;
    const rf = String(g.session.user.responderFunction || '');
    const next = await mergeFoodLogisticsResourceDeploymentForUser(g.session.user.id, licenseId, body, rf);
    return NextResponse.json(next);
}
