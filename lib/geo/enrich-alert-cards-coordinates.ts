import { resolveHeatPointsFromAlignedRows } from '@/lib/geo/resolve-aligned-event-heatpoints';

/**
 * Attach map-ready lat/lng to aligned alert cards using the same resolver as the situational map.
 * NWS rows with null coords are geocoded from their location text; USGS rows keep gauge coords.
 */
export async function enrichAlignedCardsWithMapCoordinates(
    cards: Record<string, unknown>[],
    preferState?: string | null,
): Promise<Record<string, unknown>[]> {
    if (cards.length === 0) return cards;

    const points = await resolveHeatPointsFromAlignedRows(cards, {
        maxGeocode: Math.min(Math.max(cards.length * 12, 12), 48),
        preferState,
    });
    const byId = new Map(points.map((p) => [p.id, p]));

    return cards.map((card) => {
        const id = String(card.id ?? card._id ?? '');
        const point = byId.get(id);
        if (!point) return card;
        return {
            ...card,
            lat: point.lat,
            lng: point.lng,
        };
    });
}
