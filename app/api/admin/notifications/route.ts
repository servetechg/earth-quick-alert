import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
    listUserNotifications,
    markAllNotificationsRead,
} from '@/lib/services/user-notification-service';

const ALLOWED_ROLES = new Set([
    'super-admin',
    'admin',
    'sub-admin',
    'observer',
    'manager',
]);

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '30', 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
        const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true';

        const data = await listUserNotifications(session.user.id as string, { limit, unreadOnly });
        return NextResponse.json(data);
    } catch (error) {
        console.error('[admin/notifications] GET failed:', error);
        return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const role = String(session.user.role ?? '').toLowerCase();
        if (!ALLOWED_ROLES.has(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json().catch(() => null);
        if (body?.action !== 'mark_all_read') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const unreadCount = await markAllNotificationsRead(session.user.id as string);
        return NextResponse.json({ message: 'All notifications marked read', unreadCount });
    } catch (error) {
        console.error('[admin/notifications] POST failed:', error);
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
    }
}
