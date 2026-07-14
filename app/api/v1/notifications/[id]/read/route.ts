import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { markNotificationRead } from '@/lib/services/user-notification-service';

export const dynamic = 'force-dynamic';

export async function PATCH(
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const { id } = await ctx.params;
        const result = await markNotificationRead(auth.userId, id);
        return apiJson(result);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'UPDATE_FAILED';
        if (msg === 'NOT_FOUND') {
            return apiError('Notification not found', 404);
        }
        console.error('PATCH /v1/notifications/[id]/read:', e);
        return apiError('Failed to mark notification read', 500);
    }
}
