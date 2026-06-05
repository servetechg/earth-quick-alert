import { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/api/json-response';
import { requireMobileBearerUser } from '@/lib/auth/mobile/require-mobile-user';
import { getMobilePreparednessCategory } from '@/lib/services/mobile/preparedness-service';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ categoryId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const auth = await requireMobileBearerUser(req);
        if ('error' in auth) return auth.error;

        const { categoryId } = await params;
        const category = await getMobilePreparednessCategory(auth.userId, categoryId);
        if (!category) {
            return apiError('Category not found', 404);
        }
        return apiJson(category);
    } catch (e) {
        console.error('v1/preparedness/categories/[categoryId]:', e);
        return apiError('Failed to load category', 500);
    }
}
