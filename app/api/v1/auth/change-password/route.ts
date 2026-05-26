import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { changePasswordSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { requireBearerUser } from '@/lib/auth/mobile/session';
import { revokeAllRefreshTokens } from '@/lib/auth/mobile/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireBearerUser(req);
        if ('error' in auth) return auth.error;

        const body = await req.json().catch(() => null);
        const parsed = changePasswordSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await connectDB();
        const user = await User.findById(auth.userId).select('+password');
        if (!user) {
            return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
        }

        const match = await bcrypt.compare(parsed.data.currentPassword, user.password);
        if (!match) {
            return apiError('Current password is incorrect', 401, { code: 'INVALID_CREDENTIALS' });
        }

        user.password = await bcrypt.hash(parsed.data.newPassword, 10);
        await user.save();
        await revokeAllRefreshTokens(auth.userId);

        return apiJson({ message: 'Password updated' });
    } catch (e) {
        console.error('v1/auth/change-password:', e);
        return apiError('Password change failed', 500);
    }
}
