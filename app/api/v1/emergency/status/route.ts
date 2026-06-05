import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getEmergencyStatus } from '@/lib/services/mobile/emergency-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const data = await getEmergencyStatus(auth.userId);
        return apiJson(data);
    } catch (e) {
        console.error('v1/emergency/status:', e);
        return apiError('Failed to load status', 500);
    }
}
