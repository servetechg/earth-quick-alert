import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { profileCompleteSchema } from '@/lib/validation/mobile/profile';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';
import { requireBearerUser } from '@/lib/auth/mobile/session';
import { loadUserProfile, saveUserProfile } from '@/lib/services/mobile/auth-service';
import { toApiUser } from '@/lib/auth/mobile/user-mapper';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = profileCompleteSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await connectDB();
        const user = await User.findById(auth.userId);
        if (!user) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        if (!user.emailVerified) {
            return apiError('Email must be verified before completing profile', 403, {
                code: 'EMAIL_NOT_VERIFIED',
            });
        }

        const profilePayload = {
            ...parsed.data.profile,
            alertLocations: parsed.data.profile.alertLocations ?? [],
        };

        await saveUserProfile(auth.userId, profilePayload);
        const updated = await User.findById(auth.userId);
        const profile = await loadUserProfile(auth.userId);

        return apiJson({
            message: 'Profile completed',
            user: toApiUser(updated!),
            profile,
        });
    } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'LOCATION_LIMIT_EXCEEDED') {
            return apiError('Maximum 5 alert locations allowed', 400, {
                code: 'LOCATION_LIMIT_EXCEEDED',
            });
        }
        console.error('v1/profile/complete:', e);
        return apiError('Failed to save profile', 500);
    }
}
