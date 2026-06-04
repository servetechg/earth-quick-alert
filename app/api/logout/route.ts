import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/auth';
import { recordActivity, ACTIVITY_ACTIONS } from '@/lib/activity-log';
import { clearDemoSimulationCookieOptions } from '@/lib/demo/cookie';

export async function POST() {
    const jar = await cookies();
    const sessionTok = jar.get('session')?.value;
    let userId: string | null = null;
    if (sessionTok) {
        try {
            const payload = await decrypt(sessionTok);
            userId = typeof payload?.user?.id === 'string' ? payload.user.id : null;
        } catch {
            userId = null;
        }
    }

    void recordActivity({
        userId,
        action: ACTIVITY_ACTIONS.LOGOUT,
        label: 'Signed out',
    });

    const response = NextResponse.json({ success: true });

    jar.delete('session');
    jar.delete('userRole');
    jar.set(clearDemoSimulationCookieOptions());

    return response;
}
