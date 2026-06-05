import { randomUUID } from 'crypto';
import type { AlertLocationPayload } from '@/lib/types/mobile/auth';

const MAX_ALERT_LOCATIONS = 5;

/** US ZIP optional for alert-only locations (city/state/label). */
export function normalizeOptionalZip(zip?: string | null): string {
    const z = (zip ?? '').trim();
    if (!z) return '';
    return z;
}

export function normalizeUsState(state: string): string {
    const s = state.trim();
    if (s.length === 2) return s.toUpperCase();
    return s;
}

/**
 * On onboarding complete / PUT: replace client ids (`loc-123…`) with server UUIDs.
 * Primary home address is stored separately — do not merge into alertLocations.
 */
export function normalizeAlertLocationsForSave(
    input: AlertLocationPayload[] | undefined | null,
): AlertLocationPayload[] {
    if (!input?.length) return [];

    if (input.length > MAX_ALERT_LOCATIONS) {
        const err = new Error('LOCATION_LIMIT_EXCEEDED');
        (err as Error & { code: string }).code = 'LOCATION_LIMIT_EXCEEDED';
        throw err;
    }

    return input.map((loc) => ({
        id: randomUUID(),
        label: String(loc.label ?? '').trim(),
        city: String(loc.city ?? '').trim(),
        state: normalizeUsState(String(loc.state ?? '')),
        zipCode: normalizeOptionalZip(loc.zipCode),
    }));
}
