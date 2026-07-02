import path from 'node:path';
import MapLayerEmergencyResourceSite from '@/models/MapLayerEmergencyResourceSite';
import { createStaticPlacesQuery } from '@/lib/gis/layers/static-google-places-query';
import { ingestStaticGooglePlacesFromFile } from '@/lib/gis/layers/static-google-places-ingest';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';

export const emergencyResourceSitesPlacesQuery = createStaticPlacesQuery(
    'emergency-resource-sites',
    'resource',
    MapLayerEmergencyResourceSite,
);

export type EmergencyResourceSiteMapMarker = StaticPlaceMapMarker;

export const queryEmergencyResourceSitesByState = emergencyResourceSitesPlacesQuery.queryByState;
export const queryEmergencyResourceSitesByBounds = emergencyResourceSitesPlacesQuery.queryByBounds;
export const invalidateEmergencyResourceSitesLayerCache =
    emergencyResourceSitesPlacesQuery.invalidateCache;

export const EMERGENCY_RESOURCE_SITES_JSON_ARRAY_KEY = 'emergencyResourceSites';

export function defaultEmergencyResourceSitesJsonPath(): string {
    return path.join(process.cwd(), 'data', 'us-emergency-resource-sites.json');
}

export async function ingestEmergencyResourceSitesFromFile(filePath?: string) {
    return ingestStaticGooglePlacesFromFile(
        MapLayerEmergencyResourceSite,
        filePath ?? defaultEmergencyResourceSitesJsonPath(),
        EMERGENCY_RESOURCE_SITES_JSON_ARRAY_KEY,
    );
}
