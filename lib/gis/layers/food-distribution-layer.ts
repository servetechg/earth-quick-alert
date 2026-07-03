import path from 'node:path';
import MapLayerFoodDistribution from '@/models/MapLayerFoodDistribution';
import { createStaticPlacesQuery } from '@/lib/gis/layers/static-google-places-query';
import { ingestStaticGooglePlacesFromFile } from '@/lib/gis/layers/static-google-places-ingest';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';

export const foodDistributionPlacesQuery = createStaticPlacesQuery(
    'food-distribution',
    'meals',
    MapLayerFoodDistribution,
);

export type FoodDistributionMapMarker = StaticPlaceMapMarker;

export const queryFoodDistributionByState = foodDistributionPlacesQuery.queryByState;
export const queryFoodDistributionByBounds = foodDistributionPlacesQuery.queryByBounds;
export const invalidateFoodDistributionLayerCache = foodDistributionPlacesQuery.invalidateCache;

export const FOOD_DISTRIBUTION_JSON_ARRAY_KEY = 'foodDistributionCenters';

export function defaultFoodDistributionJsonPath(): string {
    return path.join(process.cwd(), 'data', 'us-food-distribution-centers.json');
}

export async function ingestFoodDistributionFromFile(filePath?: string) {
    return ingestStaticGooglePlacesFromFile(
        MapLayerFoodDistribution,
        filePath ?? defaultFoodDistributionJsonPath(),
        FOOD_DISTRIBUTION_JSON_ARRAY_KEY,
    );
}
