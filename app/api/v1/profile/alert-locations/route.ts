import { NextRequest } from 'next/server';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { replaceAlertLocations } from '@/lib/services/mobile/profile-service';
import { putAlertLocationsSchema } from '@/lib/validation/mobile/alert-locations';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = putAlertLocationsSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        try {
            const alertLocations = await replaceAlertLocations(
                auth.userId,
                parsed.data.alertLocations,
            );
            return apiJson({ alertLocations });
        } catch (e) {
            const code = (e as { code?: string }).code;
            if (code === 'PROFILE_INCOMPLETE') {
                return apiError('Complete onboarding before editing locations', 403, {
                    code: 'PROFILE_INCOMPLETE',
                });
            }
            throw e;
        }
    } catch (e) {
        console.error('v1/profile/alert-locations:', e);
        return apiError('Failed to update alert locations', 500);
    }
}
