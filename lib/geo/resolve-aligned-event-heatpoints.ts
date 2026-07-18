import { geocodeLocation } from '@/lib/services/location-matching';
import { severityToHeatWeight, type UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';

/** Map responses must stay fast — do not block on Nominatim by default. */
const DEFAULT_MAX_GEOCODE = 0;
const GEOCODE_CONCURRENCY = 4;

function rowLocationText(row: Record<string, unknown>): string {
    if (typeof row.locationSummary === 'string' && row.locationSummary.trim()) {
        return row.locationSummary.trim();
    }
    if (typeof row.location === 'string' && row.location.trim()) {
        return row.location.trim();
    }
    return '';
}

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
 * Build heatmap points from the same aligned alert rows as Alerts & Communication and AI Risk.
 * Count for KPIs should use `rows.length`; this returns only rows plottable on the map.
 *
 * By default skips live geocoding so `/api/admin/situational-map` is not blocked by Nominatim.
 * Pass `maxGeocode` only for offline enrichment jobs.
 */
export async function resolveHeatPointsFromAlignedRows(
    rows: Record<string, unknown>[],
    options?: { maxGeocode?: number }
): Promise<UnifiedEventHeatPoint[]> {
    const points: UnifiedEventHeatPoint[] = [];
    let geocodeBudget = options?.maxGeocode ?? DEFAULT_MAX_GEOCODE;
    const pendingGeocode: { row: Record<string, unknown>; loc: string }[] = [];

    for (const row of rows) {
        const lat = typeof row.lat === 'number' ? row.lat : null;
        const lng = typeof row.lng === 'number' ? row.lng : null;

        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
            points.push(toHeatPoint(row, lat, lng));
            continue;
        }

        if (geocodeBudget <= 0) continue;
        const loc = rowLocationText(row);
        if (!loc) continue;
        pendingGeocode.push({ row, loc });
        geocodeBudget -= 1;
    }

    for (let i = 0; i < pendingGeocode.length; i += GEOCODE_CONCURRENCY) {
        const batch = pendingGeocode.slice(i, i + GEOCODE_CONCURRENCY);
        const resolved = await Promise.all(
            batch.map(async ({ row, loc }) => {
                const geo = await geocodeLocation(loc);
                if (!geo) return null;
                return toHeatPoint(row, geo.lat, geo.lon);
            })
        );
        for (const point of resolved) {
            if (point) points.push(point);
        }
    }

    return points;
}
