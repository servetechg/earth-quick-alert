import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getEmergencyMap } from '@/lib/services/mobile/emergency-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const data = await getEmergencyMap(auth.userId);
        if (!data) {
            return apiError('Map unavailable. Add a profile address first.', 503);
        }
        return apiJson(data);
    } catch (e) {
        console.error('v1/emergency/map:', e);
        return apiError('Failed to load map', 500);
    }
}
