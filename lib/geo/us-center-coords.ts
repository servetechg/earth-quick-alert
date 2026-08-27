/** Geographic center of the contiguous US — used as a last-resort NWS fallback, not a real alert location. */
export const US_CENTER_LAT = 39.8283;
export const US_CENTER_LNG = -98.5795;

export function isUsCenterFallbackCoords(
    lat: number | null | undefined,
    lng: number | null | undefined,
): boolean {
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return Math.abs(lat - US_CENTER_LAT) < 0.0001 && Math.abs(lng - US_CENTER_LNG) < 0.0001;
}

export function sanitizeAlertCoordinates(
    lat: number | null | undefined,
    lng: number | null | undefined,
): { lat: number | null; lng: number | null } {
    if (lat == null || lng == null) return { lat: null, lng: null };
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
    if (isUsCenterFallbackCoords(lat, lng)) return { lat: null, lng: null };
    return { lat, lng };
}
