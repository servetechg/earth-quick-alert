import { geocodeAddress } from '@/lib/services/mock-map-service';

const USA_CENTER = { lat: 37.0902, lng: -95.7129 };

function isUsaFallback(pos: { lat: number; lng: number }): boolean {
    return Math.abs(pos.lat - USA_CENTER.lat) < 0.01 && Math.abs(pos.lng - USA_CENTER.lng) < 0.01;
}

/** First affected area string from a hydrated alert row. */
export function primaryAlertArea(alert: {
    locationSummary?: string;
    location?: string;
    locations?: string[];
}): string {
    if (Array.isArray(alert.locations) && alert.locations.length > 0) {
        const first = alert.locations.find((x) => String(x || '').trim());
        if (first) return String(first).trim();
    }
    const summary = String(alert.locationSummary ?? alert.location ?? '').trim();
    if (!summary) return '';
    if (summary.includes(';')) return summary.split(';')[0]!.trim();
    return summary;
}

/** Build a geocoder query from alert geography text + optional sub-admin state scope. */
export function buildAlertGeocodeQuery(
    alert: { locationSummary?: string; location?: string; locations?: string[] },
    focusState?: string,
): string {
    const area = primaryAlertArea(alert);
    if (!area) return focusState ? `${focusState}, USA` : 'USA';
    const st = (focusState || '').trim();
    if (st && !new RegExp(`\\b${st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(area)) {
        return `${area}, ${st}, USA`;
    }
    if (/\b(USA|United States)\b/i.test(area)) return area;
    return `${area}, USA`;
}

export async function geocodeAlertForMap(
    alert: { locationSummary?: string; location?: string; locations?: string[] },
    focusState?: string,
): Promise<{ lat: number; lng: number } | null> {
    const query = buildAlertGeocodeQuery(alert, focusState);
    if (!query || query === 'USA') return null;
    const pos = await geocodeAddress(query);
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return null;
    if (isUsaFallback(pos)) return null;
    return pos;
}
