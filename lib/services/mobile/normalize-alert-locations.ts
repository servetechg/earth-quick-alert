import { randomUUID } from 'crypto';
import type { AlertLocationPayload } from '@/lib/types/mobile/auth';

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function resolveLocationId(id?: string | null): string {
    const trimmed = String(id ?? '').trim();
    if (UUID_RE.test(trimmed)) return trimmed;
    return randomUUID();
}

/**
 * On onboarding complete / PUT: assign server UUIDs for new client ids (`loc-123…`).
 * Preserve existing server UUIDs so edits update the same row.
 */
export function normalizeAlertLocationsForSave(
    input: AlertLocationPayload[] | undefined | null,
): AlertLocationPayload[] {
    if (!input?.length) return [];

    return input.map((loc) => ({
        id: resolveLocationId(loc.id),
        label: String(loc.label ?? '').trim(),
        city: String(loc.city ?? '').trim(),
        state: normalizeUsState(String(loc.state ?? '')),
        zipCode: normalizeOptionalZip(loc.zipCode),
    }));
}
