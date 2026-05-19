import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getResponderDashboardKind } from '@/lib/responder-verticals';

type ResponderGate =
    | { ok: true; session: any; vertical: string; kind: ReturnType<typeof getResponderDashboardKind> }
    | { ok: false; response: NextResponse };

export async function gateResponder(
    allowedKind?: 'hospital' | 'police' | 'hotel' | 'pharmacy' | 'transit' | 'energy' | 'gas' | 'electric' | 'water' | 'food-logistics' | 'national-guard',
): Promise<ResponderGate> {
    const session = await getSession();
    if (!session?.user?.id) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    if (session.user.role !== 'responder') {
        return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    const vertical = String(session.user.responderVertical || '');
    const kind = getResponderDashboardKind(vertical);
    if (allowedKind && kind !== allowedKind) {
        return { ok: false, response: NextResponse.json({ error: 'Forbidden for this responder vertical' }, { status: 403 }) };
    }
    return { ok: true, session, vertical, kind };
}
