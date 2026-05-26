import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/mobile/tokens';

const SECRET_KEY = process.env.JWT_SECRET || 'ready2go-emergency-dashboard-secret-key-2026';
const key = new TextEncoder().encode(SECRET_KEY);

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(key);
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    });
    return payload;
}

export async function getSession(req?: Request) {
    const bearer = req?.headers.get('authorization');
    if (bearer?.startsWith('Bearer ')) {
        const token = bearer.slice(7).trim();
        const mobile = await verifyAccessToken(token);
        if (mobile) {
            return {
                user: {
                    id: mobile.user.id,
                    email: mobile.user.email,
                    name: `${mobile.user.firstName} ${mobile.user.lastName}`.trim(),
                    role: 'user',
                    accountStatus: 'approved',
                    licenseId: null,
                    responderVertical: '',
                    responderFunction: '',
                },
            };
        }
    }

    const session = (await cookies()).get('session')?.value;
    if (!session) return null;
    try {
        return await decrypt(session);
    } catch {
        return null;
    }
}
