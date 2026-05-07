import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

type SessionResult =
    | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; error?: undefined }
    | { error: NextResponse };

export async function requireSuperAdmin(): Promise<SessionResult> {
    const session = await getSession();
    if (!session?.user?.id || session.user.role !== 'super-admin') {
        return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
    }
    return { session };
}

export async function requireSubAdmin(): Promise<SessionResult> {
    const session = await getSession();
    if (!session?.user?.id || session.user.role !== 'sub-admin') {
        return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
    }
    return { session };
}

export async function requireEndUser(): Promise<SessionResult> {
    const session = await getSession();
    if (!session?.user?.id || session.user.role !== 'user') {
        return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
    }
    return { session };
}

