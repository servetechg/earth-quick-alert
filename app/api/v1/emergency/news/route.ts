import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getEmergencyNews } from '@/lib/services/mobile/emergency-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const url = new URL(req.url);
        const page = Number(url.searchParams.get('page') || 1);
        const limit = Number(url.searchParams.get('limit') || 20);
        const category = url.searchParams.get('category') ?? undefined;

        const data = await getEmergencyNews(
            auth.userId,
            Number.isFinite(page) ? page : 1,
            Number.isFinite(limit) ? limit : 20,
            category,
        );
        return apiJson(data);
    } catch (e) {
        console.error('v1/emergency/news:', e);
        return apiError('Failed to load news', 500);
    }
}
