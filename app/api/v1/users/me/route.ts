import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireBearerUser } from '@/lib/auth/mobile/session';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireBearerUser(req);
        if ('error' in auth) return auth.error;

        const profile = await loadUserProfile(auth.userId);
        return apiJson({ user: auth.user, profile });
    } catch (e) {
        console.error('v1/users/me:', e);
        return apiError('Failed to load user', 500);
    }
}
