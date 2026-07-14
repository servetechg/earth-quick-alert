import { createStaticPlacesLayerGetHandler } from '@/lib/gis/layers/static-places-layer-route';
import { emergencyResourceSitesPlacesQuery } from '@/lib/gis/layers/emergency-resource-sites-layer';

export const maxDuration = 30;

export const GET = createStaticPlacesLayerGetHandler({
    layerName: 'emergency-resource-sites',
    source: 'us-emergency-resource-sites',
    query: emergencyResourceSitesPlacesQuery,
});
