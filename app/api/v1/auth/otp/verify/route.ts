import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { otpVerifySchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { verifyOtp } from '@/lib/services/mobile/otp-service';
import {
    buildAuthResponse,
    issuePasswordResetToken,
    isMobileUserRole,
} from '@/lib/services/mobile/auth-service';

export const dynamic = 'force-dynamic';

const RESET_TTL_SECONDS = 15 * 60;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = otpVerifySchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        const { email, code, purpose } = parsed.data;
        const normalized = email.toLowerCase().trim();

        const result = await verifyOtp(normalized, code, purpose);
        if (!result.ok) {
            return apiError(
                result.code === 'OTP_LOCKED' ? 'Too many attempts. Try again later.' : 'Invalid or expired code',
                result.status,
                { code: result.code },
            );
        }

        await connectDB();
        const user = await User.findOne({ email: normalized });

        if (purpose === 'EMAIL_VERIFICATION') {
            if (!user || !isMobileUserRole(user.role)) {
                return apiError('Account not found', 404);
            }
            user.emailVerified = true;
            await user.save();
            const auth = await buildAuthResponse(user);
            return apiJson(auth);
        }

        if (!user || !isMobileUserRole(user.role)) {
            return apiError('Invalid or expired code', 400, { code: 'INVALID_OTP' });
        }

        const resetToken = await issuePasswordResetToken(user._id.toString(), normalized);
        return apiJson({ resetToken, expiresInSeconds: RESET_TTL_SECONDS });
    } catch (e) {
        console.error('v1/auth/otp/verify:', e);
        return apiError('Verification failed', 500);
    }
}
