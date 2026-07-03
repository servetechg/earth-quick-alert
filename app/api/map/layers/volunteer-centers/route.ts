import { createStaticPlacesLayerGetHandler } from '@/lib/gis/layers/static-places-layer-route';
import { volunteerCentersPlacesQuery } from '@/lib/gis/layers/volunteer-centers-layer';

export const maxDuration = 30;

export const GET = createStaticPlacesLayerGetHandler({
    layerName: 'volunteer-centers',
    source: 'us-volunteer-coordination-centers',
    query: volunteerCentersPlacesQuery,
});
