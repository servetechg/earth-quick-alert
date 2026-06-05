import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobileUnreadCount } from '@/lib/services/mobile/alerts-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const unreadAlerts = await getMobileUnreadCount(auth.userId);
        return apiJson({ unreadAlerts });
    } catch (e) {
        console.error('v1/dashboard/badges:', e);
        return apiError('Failed to load badges', 500);
    }
}
