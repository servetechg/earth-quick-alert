import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { markAllMobileAlertsRead } from '@/lib/services/mobile/alerts-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const unreadCount = await markAllMobileAlertsRead(auth.userId);
        return apiJson({ message: 'OK', unreadCount });
    } catch (e) {
        console.error('v1/alerts/mark-all-read:', e);
        return apiError('Failed to mark alerts read', 500);
    }
}
