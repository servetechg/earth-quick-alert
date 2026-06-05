import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobileAlertById, setMobileAlertRead } from '@/lib/services/mobile/alerts-service';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const { id } = await params;
        const existing = await getMobileAlertById(auth.userId, id);
        if (!existing) {
            return apiError('Alert not found', 404, { code: 'ALERT_NOT_FOUND' });
        }

        const body = await req.json().catch(() => ({}));
        const read = body.read !== false;

        const unreadCount = await setMobileAlertRead(auth.userId, id, read);
        return apiJson({ message: 'OK', unreadCount });
    } catch (e) {
        console.error('v1/alerts/[id]/read:', e);
        return apiError('Failed to update alert', 500);
    }
}
