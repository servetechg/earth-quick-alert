import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { listMobilePreparednessCategories } from '@/lib/services/mobile/preparedness-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const url = new URL(req.url);
        const q = url.searchParams.get('q') ?? undefined;
        const data = await listMobilePreparednessCategories(auth.userId, q);
        return apiJson(data);
    } catch (e) {
        console.error('v1/preparedness/categories:', e);
        return apiError('Failed to load categories', 500);
    }
}
