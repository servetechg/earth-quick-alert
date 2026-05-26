import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiJson, validationError } from '@/lib/api/json-response';
import { forgotPasswordSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { sendOtp } from '@/lib/services/mobile/otp-service';
import { isMobileUserRole } from '@/lib/services/mobile/auth-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = forgotPasswordSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await connectDB();
        const email = parsed.data.email.toLowerCase().trim();
        const user = await User.findOne({ email });

        if (user && isMobileUserRole(user.role)) {
            try {
                await sendOtp(email, 'PASSWORD_RESET');
            } catch (e) {
                console.error('forgot-password OTP:', e);
            }
        }

        return apiJson({
            message: 'If an account exists, we sent instructions to your email.',
        });
    } catch (e) {
        console.error('v1/auth/forgot-password:', e);
        return apiJson({
            message: 'If an account exists, we sent instructions to your email.',
        });
    }
}
