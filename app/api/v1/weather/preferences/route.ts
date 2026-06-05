import { NextRequest } from 'next/server';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import {
    getMobileWeatherPreferences,
    updateMobileWeatherPreferences,
} from '@/lib/services/mobile/weather-service';
import { weatherPreferencesSchema } from '@/lib/validation/mobile/weather-preferences';
import { zodFieldErrors } from '@/lib/validation/mobile/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const preferences = await getMobileWeatherPreferences(auth.userId);
        return apiJson({ preferences });
    } catch (e) {
        console.error('v1/weather/preferences GET:', e);
        return apiError('Failed to load preferences', 500);
    }
}

export async function PUT(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = weatherPreferencesSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        const preferences = await updateMobileWeatherPreferences(
            auth.userId,
            parsed.data.preferences,
        );
        return apiJson({ preferences });
    } catch (e) {
        console.error('v1/weather/preferences PUT:', e);
        return apiError('Failed to update preferences', 500);
    }
}
