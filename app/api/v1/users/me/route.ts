import { NextRequest } from 'next/server';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireBearerUser } from '@/lib/auth/mobile/session';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import { patchMobileUserAccount } from '@/lib/services/mobile/profile-service';
import { patchUsersMeSchema } from '@/lib/validation/mobile/users';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

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

export async function PATCH(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = patchUsersMeSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        const patch = { ...parsed.data };
        if (patch.phone === '') delete patch.phone;

        const user = await patchMobileUserAccount(auth.userId, patch);
        if (!user) {
            return apiError('User not found', 404);
        }

        return apiJson({ user });
    } catch (e) {
        console.error('v1/users/me PATCH:', e);
        return apiError('Failed to update account', 500);
    }
}
