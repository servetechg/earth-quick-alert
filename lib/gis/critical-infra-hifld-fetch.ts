import type { CriticalInfraMapMarker } from '@/lib/demo/critical-infrastructure-markers';
import {
    CRITICAL_INFRASTRUCTURE_SECTORS,
    type CriticalInfraSectorId,
} from '@/lib/gis/critical-infrastructure-sectors';
import { hifldFiltersForSectors } from '@/lib/gis/hifld-infrastructure-sources';
import { fetchHifldFilterFeatures } from '@/lib/gis/fetch-hifld-geojson';
import { radiusBounds } from '@/lib/gis/geojson-map-utils';
import type { MapBounds } from '@/lib/gis/infrastructure-search-grid';
import { pointInUsaBounds } from '@/lib/constants/usa-map-bounds';

/** Viewport or radius search — shared by HIFLD critical-infra (no Google billing). */
export type CiInfraSearchScope =
    | { mode: 'bounds'; bounds: MapBounds }
    | { mode: 'radius'; lat: number; lng: number; radiusMeters: number };

const MAX_MARKERS_PER_SECTOR = 48;
const FEATURE_LIMIT_PER_FILTER = 250;

function scopeToBounds(scope: CiInfraSearchScope): MapBounds {
    if (scope.mode === 'bounds') return scope.bounds;
    return radiusBounds(scope.lat, scope.lng, scope.radiusMeters);
}

/**
 * CISA critical infrastructure markers from free HIFLD / NTAD / EPA ArcGIS layers.
 * Replaces Google Places for AI Risk Assessment and admin critical-infra API.
 */
export async function fetchHifldCriticalInfraMarkers(
    requestedSectors: CriticalInfraSectorId[],
    scope: CiInfraSearchScope,
): Promise<CriticalInfraMapMarker[]> {
    const bounds = scopeToBounds(scope);
    const filters = hifldFiltersForSectors(requestedSectors);
    const markers: CriticalInfraMapMarker[] = [];
    const globalSeen = new Set<string>();
    const perSectorCount = new Map<CriticalInfraSectorId, number>();

    for (const filter of filters) {
        const sectorId = filter.sectorId;
        if (!sectorId) continue;

        const sector = CRITICAL_INFRASTRUCTURE_SECTORS.find((s) => s.id === sectorId);
        let features: Awaited<ReturnType<typeof fetchHifldFilterFeatures>>;

        try {
            features = await fetchHifldFilterFeatures(filter.layers, {
                bounds,
                limit: FEATURE_LIMIT_PER_FILTER,
            });
        } catch (err) {
            console.warn(`[critical-infra-hifld] ${filter.id} skipped:`, err);
            continue;
        }

        for (const feature of features) {
            if (!pointInUsaBounds(feature.lat, feature.lng)) continue;

            const sectorCount = perSectorCount.get(sectorId) ?? 0;
            if (sectorCount >= MAX_MARKERS_PER_SECTOR) break;

            const id = `hifld:${sectorId}:${feature.id}`;
            if (globalSeen.has(id)) continue;
            globalSeen.add(id);

            markers.push({
                id,
                sectorId,
                lat: feature.lat,
                lng: feature.lng,
                title: feature.title,
                status: 'unknown',
                location: feature.location,
                description: `${sector?.label ?? sectorId} · ${feature.source}`,
                riskLevel: 'MODERATE',
            });
            perSectorCount.set(sectorId, sectorCount + 1);
        }
    }

    return markers;
}

/** Sectors with at least one HIFLD layer mapping. */
export function criticalInfraSectorsWithHifldData(): CriticalInfraSectorId[] {
    return hifldFiltersForSectors(CRITICAL_INFRASTRUCTURE_SECTORS.map((s) => s.id)).map(
        (f) => f.sectorId!,
    );
}
