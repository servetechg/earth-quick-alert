import type { InfrastructureSearchScope, MapBounds } from '@/lib/gis/infrastructure-search-grid';
import { boundsFromStateCode } from '@/lib/gis/infrastructure-search-grid';
import type { InfrastructurePlaceResult } from '@/lib/gis/infrastructure-places-fetch';
import type { GisFilterLayerDef } from '@/lib/gis/gis-filter-layers';
import type { StaticPlacesQueryApi } from '@/lib/gis/layers/static-google-places-query';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';
import { foodDistributionPlacesQuery } from '@/lib/gis/layers/food-distribution-layer';
import { generatorLocationsPlacesQuery } from '@/lib/gis/layers/generator-locations-layer';
import { volunteerCentersPlacesQuery } from '@/lib/gis/layers/volunteer-centers-layer';
import { emergencyResourceSitesPlacesQuery } from '@/lib/gis/layers/emergency-resource-sites-layer';
import { itInfrastructurePlacesQuery } from '@/lib/gis/layers/it-infrastructure-layer';
import { radiusBounds } from '@/lib/gis/geojson-map-utils';
import { calculateDistance } from '@/lib/services/mock-map-service';

const MONGO_LAYER_QUERIES: Record<string, StaticPlacesQueryApi> = {
    meals_ready: foodDistributionPlacesQuery,
    generators: generatorLocationsPlacesQuery,
    volunteers: volunteerCentersPlacesQuery,
    resources: emergencyResourceSitesPlacesQuery,
    ci_it: itInfrastructurePlacesQuery,
};

function scopeToBounds(scope: InfrastructureSearchScope): MapBounds | null {
    if (scope.mode === 'bounds') return scope.bounds;
    if (scope.mode === 'state') {
        return boundsFromStateCode(scope.stateCode);
    }
    if (scope.mode === 'radius') {
        return radiusBounds(scope.center.lat, scope.center.lng, scope.radiusMile * 1609.34 * 1.05);
    }
    return null;
}

function markerInRadiusScope(
    lat: number,
    lng: number,
    scope: InfrastructureSearchScope,
): boolean {
    if (scope.mode !== 'radius') return true;
    return calculateDistance(lat, lng, scope.center.lat, scope.center.lng) <= scope.radiusMile;
}

function toInfrastructurePlace(marker: StaticPlaceMapMarker, layer: GisFilterLayerDef): InfrastructurePlaceResult {
    return {
        place_id: marker.placeId,
        name: marker.title,
        placeType: layer.resultType,
        lat: marker.lat,
        lng: marker.lng,
        vicinity: marker.location || marker.address || marker.stateKey,
    };
}

async function queryMongoMarkersForScope(
    query: StaticPlacesQueryApi,
    scope: InfrastructureSearchScope,
    opts?: { stateKey?: string },
): Promise<StaticPlaceMapMarker[]> {
    if (scope.mode === 'state') {
        const { markers } = await query.queryByState(scope.stateCode);
        return markers;
    }

    const bounds = scopeToBounds(scope);
    if (!bounds) return [];

    const { markers } = await query.queryByBounds(bounds, {
        stateKey: opts?.stateKey ?? (scope.mode === 'state' ? scope.stateCode : undefined),
    });

    if (scope.mode === 'radius') {
        return markers.filter((m) => markerInRadiusScope(m.lat, m.lng, scope));
    }

    if (scope.mode === 'bounds' && scope.radiusClip) {
        const clip = scope.radiusClip;
        return markers.filter(
            (m) => calculateDistance(m.lat, m.lng, clip.center.lat, clip.center.lng) <= clip.radiusMile,
        );
    }

    return markers;
}

export function isMongoGisFilterLayer(layer: GisFilterLayerDef): boolean {
    return layer.fetch.mode === 'mongo' && Boolean(MONGO_LAYER_QUERIES[layer.id]);
}

export async function fetchMongoGisFilterLayerPlaces(
    scope: InfrastructureSearchScope,
    layers: GisFilterLayerDef[],
    opts?: { stateKey?: string },
): Promise<InfrastructurePlaceResult[]> {
    const mongoLayers = layers.filter(isMongoGisFilterLayer);
    if (mongoLayers.length === 0) return [];

    const byId = new Map<string, InfrastructurePlaceResult>();

    for (const layer of mongoLayers) {
        const query = MONGO_LAYER_QUERIES[layer.id];
        if (!query) continue;

        const markers = await queryMongoMarkersForScope(query, scope, opts);
        for (const marker of markers) {
            const result = toInfrastructurePlace(marker, layer);
            if (!byId.has(result.place_id)) byId.set(result.place_id, result);
        }
    }

    return [...byId.values()];
}
