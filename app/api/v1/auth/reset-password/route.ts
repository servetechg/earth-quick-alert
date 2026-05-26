import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { resetPasswordSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { consumePasswordResetToken } from '@/lib/services/mobile/auth-service';
import { revokeAllRefreshTokens } from '@/lib/auth/mobile/tokens';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = resetPasswordSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        const consumed = await consumePasswordResetToken(parsed.data.resetToken);
        if (!consumed) {
            return apiError('Invalid or expired reset token', 400, { code: 'INVALID_RESET_TOKEN' });
        }

        await connectDB();
        const user = await User.findById(consumed.userId).select('+password');
        if (!user) {
            return apiError('Invalid or expired reset token', 400, { code: 'INVALID_RESET_TOKEN' });
        }

        user.password = await bcrypt.hash(parsed.data.password, 10);
        await user.save();
        await revokeAllRefreshTokens(user._id.toString());

        return apiJson({ message: 'Password updated successfully' });
    } catch (e) {
        console.error('v1/auth/reset-password:', e);
        return apiError('Password reset failed', 500);
    }
}
