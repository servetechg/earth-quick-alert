import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { signupSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import User from '@/models/User';
import { buildAuthResponse, createMobileUser } from '@/lib/services/mobile/auth-service';
import { sendOtp } from '@/lib/services/mobile/otp-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = signupSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await connectDB();
        const { firstName, lastName, email, password } = parsed.data;
        const taken = await User.findOne({ email: email.toLowerCase().trim() });
        if (taken) {
            return apiError('An account with this email already exists', 409, { code: 'EMAIL_EXISTS' });
        }

        const user = await createMobileUser({ firstName, lastName, email, password });
        try {
            await sendOtp(user.email, 'EMAIL_VERIFICATION');
        } catch (e) {
            console.error('signup OTP send:', e);
        }

        const auth = await buildAuthResponse(user);
        return apiJson(auth, 201);
    } catch (e) {
        console.error('v1/auth/signup:', e);
        return apiError('Signup failed', 500);
    }
}
