import { CONUS_MAP_BOUNDS } from '@/lib/constants/usa-map-bounds';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';

export function boundsSpan(bounds: MapBounds): { latSpan: number; lngSpan: number } {
    return {
        latSpan: bounds.north - bounds.south,
        lngSpan: bounds.east - bounds.west,
    };
}

/** Roughly continental USA — not a single-state / regional frame. */
export function isConusSizedViewport(bounds: MapBounds): boolean {
    const { latSpan, lngSpan } = boundsSpan(bounds);
    return latSpan > 18 || lngSpan > 35;
}

/**
 * Whether layer APIs should use sparse nationwide sampling.
 * Only continental frames — state/regional views (Montana, license radius, etc.)
 * must use dense bbox queries so super-admin matches sub-admin density.
 */
export function isWideLayerViewport(bounds: MapBounds): boolean {
    return isConusSizedViewport(bounds);
}

export function isConusFetchBounds(bounds: MapBounds): boolean {
    return (
        Math.abs(bounds.west - CONUS_MAP_BOUNDS.west) < 0.05 &&
        Math.abs(bounds.east - CONUS_MAP_BOUNDS.east) < 0.05 &&
        Math.abs(bounds.south - CONUS_MAP_BOUNDS.south) < 0.05 &&
        Math.abs(bounds.north - CONUS_MAP_BOUNDS.north) < 0.05
    );
}

/** Stable fetch bounds — reduces refetch churn while panning. */
export function quantizeLayerFetchBounds(bounds: MapBounds, zoom: number): MapBounds {
    // Only collapse to full CONUS when the *bounds* are continental.
    if (isConusSizedViewport(bounds)) {
        return { ...CONUS_MAP_BOUNDS };
    }

    // Fine steps so pan/zoom always refreshes the visible shelter set (Google Maps–like).
    // Coarse 1–2° snapping previously kept a stale bbox and left the new center empty.
    const step =
        zoom <= 5 ? 1 : zoom <= 7 ? 0.5 : zoom <= 9 ? 0.25 : zoom <= 11 ? 0.1 : 0.05;
    const snap = (n: number) => Math.floor(n / step) * step;
    const snapUp = (n: number) => Math.ceil(n / step) * step;

    return {
        west: snap(bounds.west),
        south: snap(bounds.south),
        east: snapUp(bounds.east),
        north: snapUp(bounds.north),
    };
}

export function layerBoundsCacheKey(bounds: MapBounds): string {
    const r = (n: number) => n.toFixed(2);
    return `${r(bounds.west)},${r(bounds.south)},${r(bounds.east)},${r(bounds.north)}`;
}

export function wideSampleCacheKey(layer: string, bounds: MapBounds, limit: number): string {
    if (isConusFetchBounds(bounds)) {
        return `map-layer:${layer}:conus:v3:${limit}`;
    }
    return `map-layer:${layer}:bbox:${layerBoundsCacheKey(bounds)}:sample:v3:${limit}`;
}

export function bboxCacheKey(layer: string, bounds: MapBounds): string {
    if (isConusFetchBounds(bounds)) {
        return `map-layer:${layer}:conus:bbox:v3`;
    }
    return `map-layer:${layer}:bbox:${layerBoundsCacheKey(bounds)}`;
}

export type GridCellSpec = {
    row: number;
    col: number;
    bounds: MapBounds;
};

export function buildViewportGrid(
    bounds: MapBounds,
    limit: number,
): { perCell: number; rows: number; cols: number; cells: GridCellSpec[] } {
    const { latSpan, lngSpan } = boundsSpan(bounds);
    // ~5° cells so multi-state views sample the map evenly, max 24 queries per layer.
    const cols = Math.max(2, Math.min(6, Math.ceil(lngSpan / 5)));
    const rows = Math.max(2, Math.min(4, Math.ceil(latSpan / 5)));
    const perCell = Math.max(1, Math.ceil(limit / (cols * rows)));
    const cellW = lngSpan / cols;
    const cellH = latSpan / rows;
    const cells: GridCellSpec[] = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            cells.push({
                row,
                col,
                bounds: {
                    west: bounds.west + col * cellW,
                    east: bounds.west + (col + 1) * cellW,
                    south: bounds.south + row * cellH,
                    north: bounds.south + (row + 1) * cellH,
                },
            });
        }
    }

    return { perCell, rows, cols, cells };
}

export function cellGeoFilter(cellBounds: MapBounds, stateKey?: string): Record<string, unknown> {
    const geoFilter: Record<string, unknown> = {
        location: {
            $geoWithin: {
                $geometry: {
                    type: 'Polygon',
                    coordinates: [
                        [
                            [cellBounds.west, cellBounds.south],
                            [cellBounds.east, cellBounds.south],
                            [cellBounds.east, cellBounds.north],
                            [cellBounds.west, cellBounds.north],
                            [cellBounds.west, cellBounds.south],
                        ],
                    ],
                },
            },
        },
    };
    if (stateKey) {
        geoFilter.stateKey = stateKey.trim().toUpperCase();
    }
    return geoFilter;
}
