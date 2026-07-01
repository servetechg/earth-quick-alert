import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getActiveDisasterSurveyInvitation } from '@/lib/services/disaster-survey-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const invitation = await getActiveDisasterSurveyInvitation(auth.userId);
        return apiJson({ invitation });
    } catch (e) {
        console.error('GET /disaster-survey/active:', e);
        return apiError('Failed to load survey invitation', 500);
    }
}
