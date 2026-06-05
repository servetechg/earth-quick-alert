import type { UserProfilePayload } from '@/lib/types/mobile/auth';

export type UserZone = {
    key: string;
    label: string;
    locationString: string;
};

export function formatProfileAddress(
    address: UserProfilePayload['address'] | null | undefined,
): string | null {
    if (!address) return null;
    const parts = [
        address.streetAddress,
        address.aptUnit,
        address.city,
        address.state,
        address.zipCode,
    ].filter((p) => typeof p === 'string' && p.trim());
    return parts.length ? parts.join(', ') : null;
}

export function formatAlertLocation(loc: {
    label?: string;
    city: string;
    state: string;
    zipCode?: string;
}): string {
    const base = [loc.city, loc.state, loc.zipCode].filter(Boolean).join(', ');
    return loc.label?.trim() ? `${loc.label.trim()} — ${base}` : base;
}

/** Build geocodable zone strings from profile (primary + alert locations). */
export function buildUserZones(profile: UserProfilePayload | null): UserZone[] {
    const zones: UserZone[] = [];
    const primary = formatProfileAddress(profile?.address);
    if (primary) {
        zones.push({ key: 'primary', label: 'Home', locationString: primary });
    }
    for (const loc of profile?.alertLocations ?? []) {
        const locationString = formatAlertLocation(loc);
        zones.push({
            key: loc.id || `loc-${loc.city}-${loc.zipCode}`,
            label: loc.label || locationString,
            locationString,
        });
    }
    return zones;
}

export function paginate<T>(items: T[], page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const start = (safePage - 1) * safeLimit;
    const slice = items.slice(start, start + safeLimit);
    return {
        items: slice,
        page: safePage,
        limit: safeLimit,
        total: items.length,
        hasMore: start + safeLimit < items.length,
    };
}
