import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { otpSendSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { sendOtp } from '@/lib/services/mobile/otp-service';
import { isMobileUserRole } from '@/lib/services/mobile/auth-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = otpSendSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        const { email, purpose } = parsed.data;
        await connectDB();

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        const isMobile = user && isMobileUserRole(user.role);

        if (!isMobile) {
            return apiJson({ message: 'Code sent', expiresInSeconds: 600 });
        }

        try {
            const result = await sendOtp(email, purpose);
            return apiJson(result);
        } catch (e: unknown) {
            const err = e as Error & { status?: number };
            if (err.message === 'OTP_LOCKED') {
                return apiError('Too many attempts. Try again later.', 429, { code: 'OTP_LOCKED' });
            }
            if (err.message === 'OTP_RATE_LIMIT') {
                return apiError('Too many codes sent. Try again later.', 429, { code: 'OTP_RATE_LIMIT' });
            }
            throw e;
        }
    } catch (e) {
        console.error('v1/auth/otp/send:', e);
        return apiError('Failed to send code', 500);
    }
}
