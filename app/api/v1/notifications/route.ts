import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import {
    listUserNotifications,
    markAllNotificationsRead,
} from '@/lib/services/user-notification-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const limitRaw = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
        const unreadOnly = req.nextUrl.searchParams.get('unreadOnly') === 'true';

        const data = await listUserNotifications(auth.userId, { limit, unreadOnly });
        return apiJson(data);
    } catch (e) {
        console.error('GET /v1/notifications:', e);
        return apiError('Failed to load notifications', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        if (body?.action !== 'mark_all_read') {
            return apiError('Invalid action', 400);
        }

        const unreadCount = await markAllNotificationsRead(auth.userId);
        return apiJson({ message: 'All notifications marked read', unreadCount });
    } catch (e) {
        console.error('POST /v1/notifications:', e);
        return apiError('Failed to update notifications', 500);
    }
}
