import { resolveUniqueAlertCoordinates } from '@/lib/geo/resolve-alert-coordinates';
import { severityToHeatWeight, type UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';

function toHeatPoint(row: Record<string, unknown>, lat: number, lng: number): UnifiedEventHeatPoint {
    const locationText =
        typeof row.location === 'string' && row.location.trim()
            ? row.location.trim()
            : typeof row.locationSummary === 'string' && row.locationSummary.trim()
              ? row.locationSummary.trim()
              : undefined;

    return {
        id: String(row.id ?? row._id ?? ''),
        lat,
        lng,
        weight: severityToHeatWeight(
            typeof row.severity === 'string' ? row.severity : undefined,
            typeof row.type === 'string' ? row.type : undefined
        ),
        severity: String(row.severity ?? 'Moderate'),
        name: String(row.name ?? 'Event'),
        category: typeof row.category === 'string' ? row.category : undefined,
        source: typeof row.source === 'string' ? row.source : undefined,
        location: locationText,
    };
}

/**
 * Build heatmap points from the same aligned alert rows as Alerts & Communication.
 * Each alert gets a distinct coordinate when possible (geocodes specific locations,
 * de-duplicates overlapping centroids so every alert produces a visible heat spot).
 */
export async function resolveHeatPointsFromAlignedRows(
    rows: Record<string, unknown>[],
    options?: { maxGeocode?: number; preferState?: string | null },
): Promise<UnifiedEventHeatPoint[]> {
    const points: UnifiedEventHeatPoint[] = [];
    const used: { lat: number; lng: number }[] = [];
    const geocodeBudget = {
        remaining: options?.maxGeocode ?? Math.min(Math.max(rows.length * 12, 12), 48),
    };

    for (const row of rows) {
        const coords = await resolveUniqueAlertCoordinates(row, {
            preferState: options?.preferState,
            used,
            geocodeBudget,
        });
        if (!coords) continue;

        used.push(coords);
        points.push(toHeatPoint(row, coords.lat, coords.lng));
    }

    return points;
}
