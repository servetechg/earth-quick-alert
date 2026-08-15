import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { listIdaApplications } from '@/lib/services/ida-service';
import type { IdaApplicationStatus } from '@/lib/types/ida';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

        const url = new URL(req.url);
        const statusRaw = url.searchParams.get('status') ?? '';
        const statusFilter = (
            ['pending', 'in_review', 'needs_info', 'referred', 'closed'] as const
        ).includes(statusRaw as IdaApplicationStatus)
            ? (statusRaw as IdaApplicationStatus)
            : undefined;

        const applications = await listIdaApplications(
            role,
            String(session.user.id),
            statusFilter,
        );
        return NextResponse.json({ applications });
    } catch (e) {
        console.error('GET admin/disaster-assistance/applications:', e);
        return NextResponse.json({ error: 'Failed to load applications' }, { status: 500 });
    }
}
