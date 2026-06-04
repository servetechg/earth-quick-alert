import { cookies } from 'next/headers';
import { DEMO_SIMULATION_COOKIE } from '@/lib/demo/constants';

export async function readDemoSimulationCookie(): Promise<boolean> {
    const value = (await cookies()).get(DEMO_SIMULATION_COOKIE)?.value;
    return value === '1';
}

export function demoSimulationCookieOptions(maxAgeSec: number) {
    return {
        name: DEMO_SIMULATION_COOKIE,
        value: '1' as const,
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: maxAgeSec,
    };
}

export function clearDemoSimulationCookieOptions() {
    return {
        name: DEMO_SIMULATION_COOKIE,
        value: '',
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    };
}
