import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { refreshSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { rotateRefreshToken, signAccessToken } from '@/lib/auth/mobile/tokens';
import { toApiUser } from '@/lib/auth/mobile/user-mapper';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = refreshSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        const rotated = await rotateRefreshToken(parsed.data.refreshToken);
        if (!rotated) {
            return apiError('Invalid or expired refresh token', 401, { code: 'INVALID_REFRESH_TOKEN' });
        }

        await connectDB();
        const user = await User.findById(rotated.userId);
        if (!user) {
            return apiError('Invalid or expired refresh token', 401, { code: 'INVALID_REFRESH_TOKEN' });
        }

        const apiUser = toApiUser(user);
        const accessToken = await signAccessToken(apiUser);

        return apiJson({
            accessToken,
            refreshToken: rotated.newRefreshToken,
        });
    } catch (e) {
        console.error('v1/auth/refresh:', e);
        return apiError('Token refresh failed', 500);
    }
}
