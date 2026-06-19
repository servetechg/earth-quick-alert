import { coverageCircleLatLngBounds, type LatLngPoint } from '@/lib/geo/license-coverage-radius';
import type { UnifiedEventHeatPoint } from '@/lib/geo/unified-event-heatmap';
import type { CoverageCircleSpec, MapStateBounds } from '@/lib/gis/situational-map-types';

export function coverageToMapBounds(coverage: CoverageCircleSpec): MapStateBounds {
    const box = coverageCircleLatLngBounds(coverage.center, coverage.radiusMeters);
    return {
        west: box.southwest.lng,
        south: box.southwest.lat,
        east: box.northeast.lng,
        north: box.northeast.lat,
    };
}

export function boundsToLeafletLatLngBounds(bounds: MapStateBounds): [[number, number], [number, number]] {
    return [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
    ];
}

export function leafletBoundsToMapState(bounds: {
    getSouthWest(): { lat: number; lng: number };
    getNorthEast(): { lat: number; lng: number };
}): MapStateBounds {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat };
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((aLat * Math.PI) / 180) *
            Math.cos((bLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function findNearestHeatIncident(
    lat: number,
    lng: number,
    incidents: UnifiedEventHeatPoint[],
    maxKm = 40,
): UnifiedEventHeatPoint | null {
    let best: UnifiedEventHeatPoint | null = null;
    let bestDist = Infinity;
    for (const inc of incidents) {
        const d = distanceKm(lat, lng, inc.lat, inc.lng);
        if (d < bestDist) {
            bestDist = d;
            best = inc;
        }
    }
    return best && bestDist <= maxKm ? best : null;
}

export function viewportExceedsBounds(
    mapBounds: MapStateBounds,
    limit: MapStateBounds,
): boolean {
    return (
        mapBounds.west < limit.west ||
        mapBounds.east > limit.east ||
        mapBounds.south < limit.south ||
        mapBounds.north > limit.north
    );
}

export const DEFAULT_MAP_CENTER: LatLngPoint = { lat: 37.7749, lng: -122.4194 };
export const SUB_ADMIN_MIN_ZOOM = 3;
