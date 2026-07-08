import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { markNotificationRead } from '@/lib/services/user-notification-service';

const ALLOWED_ROLES = new Set([
    'super-admin',
    'admin',
    'sub-admin',
    'observer',
    'manager',
]);

export async function PATCH(
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
        const result = await markNotificationRead(session.user.id as string, id);
        return NextResponse.json(result);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'UPDATE_FAILED';
        if (msg === 'NOT_FOUND') {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        console.error('[admin/notifications] PATCH failed:', error);
        return NextResponse.json({ error: 'Failed to mark notification read' }, { status: 500 });
    }
}
