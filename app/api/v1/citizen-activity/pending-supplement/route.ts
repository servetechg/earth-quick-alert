import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getPendingCitizenActivitySupplement } from '@/lib/services/citizen-activity-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const pending = await getPendingCitizenActivitySupplement(auth.userId);
        return apiJson({ pending });
    } catch (e) {
        console.error('GET /v1/citizen-activity/pending-supplement:', e);
        return apiError('Failed to load pending report details', 500);
    }
}
