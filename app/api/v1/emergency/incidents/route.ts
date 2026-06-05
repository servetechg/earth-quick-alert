import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getEmergencyIncidents } from '@/lib/services/mobile/emergency-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const items = await getEmergencyIncidents(auth.userId);
        return apiJson({ items });
    } catch (e) {
        console.error('v1/emergency/incidents:', e);
        return apiError('Failed to load incidents', 500);
    }
}
