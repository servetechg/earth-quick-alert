import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { dispatchIdaCampaign } from '@/lib/services/ida-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(
    req: Request,
    ctx: { params: Promise<{ id: string }> },
) {
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

        const { id } = await ctx.params;
        const body = (await req.json().catch(() => ({}))) as { userIds?: string[] };
        const userIds = Array.isArray(body.userIds)
            ? body.userIds.map((x) => String(x).trim()).filter(Boolean)
            : undefined;

        const result = await dispatchIdaCampaign(id, {
            userIds,
            actorRole: role,
            actorUserId: String(session.user.id),
        });
        return NextResponse.json(result);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'DISPATCH_FAILED';
        if (msg === 'CAMPAIGN_NOT_FOUND') {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }
        console.error('POST admin/disaster-assistance/campaigns/[id]/dispatch:', e);
        return NextResponse.json({ error: 'Failed to dispatch campaign' }, { status: 500 });
    }
}
