import { NextRequest } from 'next/server';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { patchMobileProfile } from '@/lib/services/mobile/profile-service';
import { profilePatchSchema } from '@/lib/validation/mobile/profile-patch';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = profilePatchSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        try {
            const profile = await patchMobileProfile(auth.userId, parsed.data);
            return apiJson({ message: 'Profile updated', profile });
        } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === 'PROFILE_INCOMPLETE') {
                return apiError('Complete onboarding before editing profile', 403, {
                    code: 'PROFILE_INCOMPLETE',
                });
            }
            throw e;
        }
    } catch (e) {
        console.error('v1/profile PATCH:', e);
        return apiError('Failed to update profile', 500);
    }
}
