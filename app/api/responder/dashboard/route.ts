import { NextResponse } from 'next/server';
import { gateResponder } from '@/lib/responder-api-gate';
import { getResponderDashboardBundle } from '@/lib/services/responder';

export async function GET() {
    const g = await gateResponder();
    if (!g.ok) return g.response;

    const responderFunction = String(g.session.user.responderFunction || '');
    const displayName = String(g.session.user.name || '');
    const licenseId = g.session.user.licenseId ?? null;
    const bundle = await getResponderDashboardBundle(
        g.vertical,
        responderFunction,
        displayName,
        g.session.user.id,
        licenseId,
    );
    return NextResponse.json(bundle);
}
