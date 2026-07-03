import { createStaticPlacesLayerGetHandler } from '@/lib/gis/layers/static-places-layer-route';
import { generatorLocationsPlacesQuery } from '@/lib/gis/layers/generator-locations-layer';

export const maxDuration = 30;

export const GET = createStaticPlacesLayerGetHandler({
    layerName: 'generator-locations',
    source: 'us-generator-locations',
    query: generatorLocationsPlacesQuery,
});
