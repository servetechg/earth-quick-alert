import path from 'node:path';
import MapLayerItInfrastructure from '@/models/MapLayerItInfrastructure';
import { createStaticPlacesQuery } from '@/lib/gis/layers/static-google-places-query';
import { ingestStaticGooglePlacesFromFile } from '@/lib/gis/layers/static-google-places-ingest';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';

export const itInfrastructurePlacesQuery = createStaticPlacesQuery(
    'it-infrastructure',
    'it',
    MapLayerItInfrastructure,
);

export type ItInfrastructureMapMarker = StaticPlaceMapMarker;

export const queryItInfrastructureByState = itInfrastructurePlacesQuery.queryByState;
export const queryItInfrastructureByBounds = itInfrastructurePlacesQuery.queryByBounds;
export const invalidateItInfrastructureLayerCache = itInfrastructurePlacesQuery.invalidateCache;

export const IT_INFRASTRUCTURE_JSON_ARRAY_KEY = 'itInfrastructureLocations';

export function defaultItInfrastructureJsonPath(): string {
    return path.join(process.cwd(), 'data', 'us-it-infrastructure.json');
}

export async function ingestItInfrastructureFromFile(filePath?: string) {
    return ingestStaticGooglePlacesFromFile(
        MapLayerItInfrastructure,
        filePath ?? defaultItInfrastructureJsonPath(),
        IT_INFRASTRUCTURE_JSON_ARRAY_KEY,
    );
}
