import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobileWeatherCurrent } from '@/lib/services/mobile/weather-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const weather = await getMobileWeatherCurrent(auth.userId);
        if (!weather) {
            return apiError('Weather data unavailable. Complete your profile address first.', 503, {
                code: 'WEATHER_UNAVAILABLE',
            });
        }
        return apiJson(weather);
    } catch (e) {
        console.error('v1/weather/current:', e);
        return apiError('Failed to load weather', 503, { code: 'WEATHER_UNAVAILABLE' });
    }
}
