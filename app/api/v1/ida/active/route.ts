import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getActiveIdaInvitation } from '@/lib/services/ida-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const invitation = await getActiveIdaInvitation(auth.userId);
        return apiJson({ invitation });
    } catch (e) {
        console.error('GET /ida/active:', e);
        return apiError('Failed to load assistance application invitation', 500);
    }
}
