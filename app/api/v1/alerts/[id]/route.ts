import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobileAlertById } from '@/lib/services/mobile/alerts-service';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const { id } = await params;
        const alert = await getMobileAlertById(auth.userId, id);
        if (!alert) {
            return apiError('Alert not found', 404, { code: 'ALERT_NOT_FOUND' });
        }

        return apiJson(alert);
    } catch (e) {
        console.error('v1/alerts/[id]:', e);
        return apiError('Failed to load alert', 500);
    }
}
