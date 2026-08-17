import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import { searchIdaTargetUsers } from '@/lib/services/ida-service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

        const url = new URL(req.url);
        const q = url.searchParams.get('q') ?? '';
        const users = await searchIdaTargetUsers(q);
        return NextResponse.json({ users });
    } catch (e) {
        console.error('GET admin/disaster-assistance/target-users:', e);
        return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }
}
