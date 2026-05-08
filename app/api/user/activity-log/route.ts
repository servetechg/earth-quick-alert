import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
import { getSession } from '@/lib/auth';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const rawLimit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10);
        const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : 100, MAX_LIMIT);

        const rows = await ActivityLog.find({ userId: session.user.id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('action label meta createdAt')
            .lean();

        const data = rows.map((r: any) => ({
            id: r._id.toString(),
            action: r.action,
            label: r.label,
            meta: r.meta && typeof r.meta === 'object' ? r.meta : {},
            createdAt: r.createdAt?.toISOString?.() ?? new Date(r.createdAt).toISOString(),
        }));

        return NextResponse.json({ success: true, data });
    } catch (e: any) {
        console.error('GET /api/user/activity-log:', e);
        return NextResponse.json(
            { success: false, error: e?.message || 'Failed to load activity log' },
            { status: 500 },
        );
    }
}
