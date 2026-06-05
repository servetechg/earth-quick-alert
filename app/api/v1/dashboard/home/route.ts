import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { buildDashboardHome } from '@/lib/services/mobile/dashboard-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const url = new URL(req.url);
        const includeRaw = url.searchParams.get('include');
        const include = includeRaw
            ? includeRaw.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
        const newsLimit = Number(url.searchParams.get('newsLimit') || 4);
        const alertsLimit = Number(url.searchParams.get('alertsLimit') || 2);

        const data = await buildDashboardHome(auth.userId, {
            include,
            newsLimit: Number.isFinite(newsLimit) ? newsLimit : 4,
            alertsLimit: Number.isFinite(alertsLimit) ? alertsLimit : 2,
        });

        return apiJson(data);
    } catch (e) {
        console.error('v1/dashboard/home:', e);
        return apiError('Failed to load dashboard', 500);
    }
}
