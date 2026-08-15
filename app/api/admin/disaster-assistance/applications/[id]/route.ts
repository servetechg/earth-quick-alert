import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getSession } from '@/lib/auth';
import {
    getIdaApplicationDetail,
    updateIdaApplicationStatus,
} from '@/lib/services/ida-service';
import type { IdaApplicationStatus } from '@/lib/types/ida';

export const dynamic = 'force-dynamic';

export async function GET(
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
        const detail = await getIdaApplicationDetail(id, role, String(session.user.id));
        if (!detail) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        return NextResponse.json({ application: detail });
    } catch (e) {
        console.error('GET admin/disaster-assistance/applications/[id]:', e);
        return NextResponse.json({ error: 'Failed to load application' }, { status: 500 });
    }
}

export async function PATCH(
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
        const body = (await req.json()) as {
            applicationStatus?: IdaApplicationStatus;
            adminNotes?: string;
        };

        const updated = await updateIdaApplicationStatus(id, String(session.user.id), {
            applicationStatus: body.applicationStatus,
            adminNotes: body.adminNotes,
        });
        return NextResponse.json({ application: updated });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'UPDATE_FAILED';
        if (msg === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
        console.error('PATCH admin/disaster-assistance/applications/[id]:', e);
        return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
    }
}
