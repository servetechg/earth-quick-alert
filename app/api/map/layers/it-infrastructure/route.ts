import { createStaticPlacesLayerGetHandler } from '@/lib/gis/layers/static-places-layer-route';
import { itInfrastructurePlacesQuery } from '@/lib/gis/layers/it-infrastructure-layer';

export const maxDuration = 30;

export const GET = createStaticPlacesLayerGetHandler({
    layerName: 'it-infrastructure',
    source: 'us-it-infrastructure',
    query: itInfrastructurePlacesQuery,
});
