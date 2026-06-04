import { DEMO_PRESENTATION_EMAIL } from '@/lib/demo/constants';

export function normalizeDemoEmail(email: string | undefined | null): string {
    return String(email ?? '')
        .trim()
        .toLowerCase();
}

export function isDemoEligibleEmail(email: string | undefined | null): boolean {
    return normalizeDemoEmail(email) === DEMO_PRESENTATION_EMAIL;
}
