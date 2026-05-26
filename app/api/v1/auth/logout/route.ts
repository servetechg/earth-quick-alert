import { NextRequest } from 'next/server';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { logoutSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { requireBearerUser } from '@/lib/auth/mobile/session';
import { logoutUser } from '@/lib/services/mobile/auth-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => ({}));
        const parsed = logoutSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await logoutUser(auth.userId, parsed.data.refreshToken);
        return apiJson({ message: 'Logged out' });
    } catch (e) {
        console.error('v1/auth/logout:', e);
        return apiError('Logout failed', 500);
    }
}
