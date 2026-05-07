import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildPreparednessWithTasks } from '@/lib/preparedness-tasks/build-preparedness-with-tasks';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return jsonError('Unauthorized', 401);
        }

        const role = session.user.role;
        const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true';

        let mode: 'super-admin' | 'sub-admin' | 'user';
        if (role === 'super-admin') mode = 'super-admin';
        else if (role === 'sub-admin') mode = 'sub-admin';
        else if (role === 'user') mode = 'user';
        else return jsonError('Forbidden — use a super-admin, sub-admin, or user account', 403);

        const data = await buildPreparednessWithTasks({
            mode,
            userId: session.user.id,
            includeInactive: mode === 'super-admin' ? includeInactive : false,
        });

        return NextResponse.json({ success: true, role, data });
    } catch (e) {
        console.error('GET /api/preparedness-with-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

