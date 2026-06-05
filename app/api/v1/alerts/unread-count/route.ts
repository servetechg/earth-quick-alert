import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobileUnreadCount } from '@/lib/services/mobile/alerts-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const unreadCount = await getMobileUnreadCount(auth.userId);
        return apiJson({ unreadCount });
    } catch (e) {
        console.error('v1/alerts/unread-count:', e);
        return apiError('Failed to load unread count', 500);
    }
}
