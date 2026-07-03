import { createStaticPlacesLayerGetHandler } from '@/lib/gis/layers/static-places-layer-route';
import { foodDistributionPlacesQuery } from '@/lib/gis/layers/food-distribution-layer';

export const maxDuration = 30;

export const GET = createStaticPlacesLayerGetHandler({
    layerName: 'food-distribution-centers',
    source: 'us-food-distribution-centers',
    query: foodDistributionPlacesQuery,
});
