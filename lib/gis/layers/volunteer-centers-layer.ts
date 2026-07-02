import path from 'node:path';
import MapLayerVolunteerCenter from '@/models/MapLayerVolunteerCenter';
import { createStaticPlacesQuery } from '@/lib/gis/layers/static-google-places-query';
import { ingestStaticGooglePlacesFromFile } from '@/lib/gis/layers/static-google-places-ingest';
import type { StaticPlaceMapMarker } from '@/lib/gis/layers/static-google-places-types';

export const volunteerCentersPlacesQuery = createStaticPlacesQuery(
    'volunteer-centers',
    'volunteer',
    MapLayerVolunteerCenter,
);

export type VolunteerCenterMapMarker = StaticPlaceMapMarker;

export const queryVolunteerCentersByState = volunteerCentersPlacesQuery.queryByState;
export const queryVolunteerCentersByBounds = volunteerCentersPlacesQuery.queryByBounds;
export const invalidateVolunteerCentersLayerCache = volunteerCentersPlacesQuery.invalidateCache;

export const VOLUNTEER_CENTERS_JSON_ARRAY_KEY = 'volunteerCenters';

export function defaultVolunteerCentersJsonPath(): string {
    return path.join(process.cwd(), 'data', 'us-volunteer-coordination-centers.json');
}

export async function ingestVolunteerCentersFromFile(filePath?: string) {
    return ingestStaticGooglePlacesFromFile(
        MapLayerVolunteerCenter,
        filePath ?? defaultVolunteerCentersJsonPath(),
        VOLUNTEER_CENTERS_JSON_ARRAY_KEY,
    );
}
