import { normalizeUnifiedEventCategory } from '@/lib/unified-event/category-infer';

/**
 * Card shape returned by `GET /api/alerts-communication` (UnifiedEvent documents via legacy adapter + hydrate).
 */
export type UnifiedEventAlertCard = {
    _id: string;
    id: string;
    externalId?: string;
    source: string;
    category?: string;
    dataStatus?: 'current' | 'past';
    name: string;
    type: string;
    iconType: string;
    location: string;
    locationSummary?: string;
    locations?: string[];
    locationCount?: number;
    issuedAt: string;
    expiresAt: string;
    status: string;
    description?: string;
    instructions?: string[];
    severity: string;
    lat?: number | null;
    lng?: number | null;
    intensity?: unknown;
    createdAt?: string;
    updatedAt?: string;
};

export type UnifiedEventAlertCardView = UnifiedEventAlertCard & {
    affectedAreas: string[];
};

export function normalizeUnifiedEventAlertCards(data: unknown[]): UnifiedEventAlertCardView[] {
    return data.map((item) => {
        const row = item as Record<string, unknown>;
        const id = String(row._id ?? row.id ?? '');
        const category = row.category != null ? normalizeUnifiedEventCategory(String(row.category)) : undefined;
        const locations = Array.isArray(row.locations) ? (row.locations as string[]) : [];
        const locationSummary =
            typeof row.locationSummary === 'string'
                ? row.locationSummary
                : typeof row.location === 'string'
                  ? row.location
                  : '';
        const affectedAreas =
            locations.length > 0 ? locations : locationSummary ? [locationSummary] : [];
        return {
            ...(row as UnifiedEventAlertCard),
            _id: id,
            id,
            ...(category ? { category } : {}),
            locations,
            locationSummary,
            affectedAreas,
        };
    });
}
