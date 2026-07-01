import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { searchDisasterSurveyTargetUsers } from '@/lib/services/disaster-survey-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const session = await getSession(req);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = String(session.user.role ?? '').toLowerCase();
        if (role !== 'super-admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
        const users = await searchDisasterSurveyTargetUsers(q);
        return NextResponse.json({ users });
    } catch (e) {
        console.error('GET admin/disaster-surveys/target-users:', e);
        return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }
}
