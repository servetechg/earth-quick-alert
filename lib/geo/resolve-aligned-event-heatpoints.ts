import { geocodeLocation } from '@/lib/services/location-matching';
import { severityToHeatWeight, type UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';

const DEFAULT_MAX_GEOCODE = 80;

/**
 * Build heatmap points from the same aligned alert rows as Alerts & Communication and AI Risk.
 * Count for KPIs should use `rows.length`; this returns only rows plottable on the map.
 */
export async function resolveHeatPointsFromAlignedRows(
    rows: Record<string, unknown>[],
    options?: { maxGeocode?: number }
): Promise<UnifiedEventHeatPoint[]> {
    const points: UnifiedEventHeatPoint[] = [];
    let geocodeBudget = options?.maxGeocode ?? DEFAULT_MAX_GEOCODE;

    for (const row of rows) {
        const id = String(row.id ?? row._id ?? '');
        let lat = typeof row.lat === 'number' ? row.lat : null;
        let lng = typeof row.lng === 'number' ? row.lng : null;

        if ((lat == null || lng == null) && geocodeBudget > 0) {
            const loc =
                typeof row.locationSummary === 'string'
                    ? row.locationSummary
                    : typeof row.location === 'string'
                      ? row.location
                      : '';
            if (loc.trim()) {
                const geo = await geocodeLocation(loc);
                if (geo) {
                    lat = geo.lat;
                    lng = geo.lon;
                    geocodeBudget -= 1;
                }
            }
        }

        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            continue;
        }

        points.push({
            id,
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
        });
    }

    return points;
}
