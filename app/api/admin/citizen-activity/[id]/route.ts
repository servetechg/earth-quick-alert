import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import {
    getCitizenActivityDetailForAdmin,
    updateCitizenActivityForAdmin,
} from '@/lib/services/citizen-activity-service';

const ALLOWED_ROLES = new Set(['super-admin', 'admin', 'sub-admin', 'observer', 'manager']);

const patchSchema = z.object({
    status: z.string().max(80).optional(),
    resolutionStatus: z.enum(['pending', 'completed']).optional(),
    takeAction: z.string().max(2000).optional(),
});

export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await ctx.params;
        const activity = await getCitizenActivityDetailForAdmin(id);
        return NextResponse.json({ activity });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'FETCH_FAILED';
        if (msg === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
        }
        console.error('[citizen-activity] GET detail failed:', e);
        return NextResponse.json({ error: 'Failed to load activity detail' }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { id } = await ctx.params;
        const body = await req.json().catch(() => null);
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }

        const item = await updateCitizenActivityForAdmin(id, session.user.id as string, parsed.data);
        return NextResponse.json({ item });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'UPDATE_FAILED';
        if (msg === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
        }
        if (msg === 'NO_CHANGES') {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }
        console.error('[citizen-activity] PATCH failed:', e);
        return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
    }
}
