import path from 'node:path';
import MapLayerGenerator from '@/models/MapLayerGenerator';
import { createStaticPlacesQuery } from '@/lib/gis/layers/static-google-places-query';
import { ingestStaticGooglePlacesFromFile } from '@/lib/gis/layers/static-google-places-ingest';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';

export const generatorLocationsPlacesQuery = createStaticPlacesQuery(
    'generator-locations',
    'generator',
    MapLayerGenerator,
);

export type GeneratorLocationMapMarker = StaticPlaceMapMarker;

export const queryGeneratorLocationsByState = generatorLocationsPlacesQuery.queryByState;
export const queryGeneratorLocationsByBounds = generatorLocationsPlacesQuery.queryByBounds;
export const invalidateGeneratorLocationsLayerCache = generatorLocationsPlacesQuery.invalidateCache;

export const GENERATOR_LOCATIONS_JSON_ARRAY_KEY = 'generatorLocations';

export function defaultGeneratorLocationsJsonPath(): string {
    return path.join(process.cwd(), 'data', 'us-generator-locations.json');
}

export async function ingestGeneratorLocationsFromFile(filePath?: string) {
    return ingestStaticGooglePlacesFromFile(
        MapLayerGenerator,
        filePath ?? defaultGeneratorLocationsJsonPath(),
        GENERATOR_LOCATIONS_JSON_ARRAY_KEY,
    );
}
