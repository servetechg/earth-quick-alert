import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { dispatchDisasterSurveyCampaign } from '@/lib/services/disaster-survey-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: RouteContext) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = String(session.user.role ?? '').toLowerCase();
        if (role !== 'super-admin' && role !== 'sub-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await context.params;
        let userIds: string[] | undefined;
        try {
            const body = (await req.json()) as { userIds?: string[] };
            if (Array.isArray(body.userIds)) {
                userIds = [...new Set(body.userIds.map((uid) => String(uid).trim()).filter(Boolean))];
            }
        } catch {
            userIds = undefined;
        }

        const result = await dispatchDisasterSurveyCampaign(id, {
            userIds,
            actorRole: role,
            actorUserId: String(session.user.id),
        });
        return NextResponse.json(result);
    } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'CAMPAIGN_NOT_FOUND') {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        console.error('POST admin/disaster-surveys/campaigns/dispatch:', e);
        return NextResponse.json({ error: 'Failed to dispatch campaign' }, { status: 500 });
    }
}
