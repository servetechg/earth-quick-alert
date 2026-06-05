import type { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { apiError } from '@/lib/api/json-response';
import { requireBearerUser } from '@/lib/auth/mobile/session';

/** Bearer auth + citizen role (`user`) only. */
export async function requireMobileBearerUser(req: NextRequest) {
    const auth = await requireBearerUser(req);
    if ('error' in auth) return auth;

    await connectDB();
    const doc = await User.findById(auth.userId).select('role').lean();
    if (!doc || doc.role !== 'user') {
        return {
            error: apiError('This endpoint is only available for Ready2Go mobile accounts', 403, {
                code: 'FORBIDDEN',
            }),
        };
    }

    return auth;
}
