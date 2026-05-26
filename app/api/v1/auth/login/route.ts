import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import { apiError, apiJson, validationError } from '@/lib/api/json-response';
import { loginSchema, zodFieldErrors } from '@/lib/validation/mobile/auth';
import { buildAuthResponse, findMobileUserByEmail } from '@/lib/services/mobile/auth-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) {
            return validationError(zodFieldErrors(parsed.error));
        }

        await connectDB();
        const user = await findMobileUserByEmail(parsed.data.email);
        if (!user) {
            return apiError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
        }

        const match = await bcrypt.compare(parsed.data.password, user.password);
        if (!match) {
            return apiError('Invalid email or password', 401, { code: 'INVALID_CREDENTIALS' });
        }

        if (!user.emailVerified) {
            return apiError('Please verify your account before signing in.', 403, {
                code: 'EMAIL_NOT_VERIFIED',
            });
        }

        const auth = await buildAuthResponse(user);
        return apiJson(auth);
    } catch (e) {
        console.error('v1/auth/login:', e);
        return apiError('Login failed', 500);
    }
}
