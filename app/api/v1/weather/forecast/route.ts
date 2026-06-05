import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobileWeatherForecast } from '@/lib/services/mobile/weather-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const url = new URL(req.url);
        const days = Number(url.searchParams.get('days') || 7);
        const forecast = await getMobileWeatherForecast(
            auth.userId,
            Number.isFinite(days) ? days : 7,
        );
        if (!forecast) {
            return apiError('Forecast unavailable', 503, { code: 'WEATHER_UNAVAILABLE' });
        }
        return apiJson(forecast);
    } catch (e) {
        console.error('v1/weather/forecast:', e);
        return apiError('Failed to load forecast', 503, { code: 'WEATHER_UNAVAILABLE' });
    }
}
