import { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAccessToken } from '@/lib/auth/mobile/tokens';
import { toApiUser } from '@/lib/auth/mobile/user-mapper';
import type { ApiUser } from '@/lib/types/mobile/auth';
import { apiError } from '@/lib/api/json-response';

export function getBearerToken(req: NextRequest): string | null {
    const header = req.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
}

export async function requireBearerUser(req: NextRequest): Promise<
    | { user: ApiUser; userId: string }
    | { error: ReturnType<typeof apiError> }
> {
    const token = getBearerToken(req);
    if (!token) {
        return { error: apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' }) };
    }

    const verified = await verifyAccessToken(token);
    if (!verified) {
        return { error: apiError('Invalid or expired token', 401, { code: 'UNAUTHORIZED' }) };
    }

    await connectDB();
    const doc = await User.findById(verified.user.id);
    if (!doc) {
        return { error: apiError('User not found', 401, { code: 'UNAUTHORIZED' }) };
    }

    return { user: toApiUser(doc), userId: doc._id.toString() };
}

export async function optionalBearerUserId(req: NextRequest): Promise<string | null> {
    const token = getBearerToken(req);
    if (!token) return null;
    const verified = await verifyAccessToken(token);
    return verified?.user.id ?? null;
}
