import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { ApiUser } from '@/lib/types/mobile/auth';
import AuthRefreshToken, { hashRefreshToken } from '@/models/AuthRefreshToken';
import type { Types } from 'mongoose';

const SECRET_KEY = process.env.JWT_SECRET || 'ready2go-emergency-dashboard-secret-key-2026';
const key = new TextEncoder().encode(SECRET_KEY);

const ACCESS_TTL = process.env.MOBILE_ACCESS_TOKEN_TTL || '1h';
const REFRESH_DAYS = Number(process.env.MOBILE_REFRESH_TOKEN_DAYS || '30');

export function randomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
}

export async function signAccessToken(user: ApiUser): Promise<string> {
    return new SignJWT({ typ: 'access', user })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime(ACCESS_TTL)
        .sign(key);
}

export async function verifyAccessToken(token: string): Promise<{ user: ApiUser } | null> {
    try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        if (payload.typ !== 'access') return null;
        const user = payload.user as ApiUser | undefined;
        if (!user?.id || !user.email) return null;
        return { user };
    } catch {
        return null;
    }
}

export async function issueRefreshToken(userId: Types.ObjectId | string): Promise<string> {
    const raw = randomToken(48);
    const tokenHash = hashRefreshToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
    await AuthRefreshToken.create({ userId, tokenHash, expiresAt });
    return raw;
}

export async function rotateRefreshToken(
    rawToken: string,
): Promise<{ userId: string; newRefreshToken: string } | null> {
    const tokenHash = hashRefreshToken(rawToken);
    const row = await AuthRefreshToken.findOne({ tokenHash, revokedAt: null });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;

    row.revokedAt = new Date();
    await row.save();

    const newRefreshToken = await issueRefreshToken(row.userId);
    return { userId: row.userId.toString(), newRefreshToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawToken);
    await AuthRefreshToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
    await AuthRefreshToken.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
    );
}
