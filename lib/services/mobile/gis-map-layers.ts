import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';
import { geocodeLocation } from '@/lib/services/location-matching';
import {
    coordsInUserProfileStates,
    preferStateFromProfile,
    resolveCoordsForMobileAlert,
} from '@/lib/services/mobile/mobile-alert-coordinates';
import { isUsCenterFallbackCoords } from '@/lib/geo/us-center-coords';
import { getStateCenterCoords } from '@/lib/utils/us-state-usps';
import { buildUserZones } from '@/lib/services/mobile/zone-utils';
import type { Alert } from '@/lib/types/api-alerts';
import { AlertSource } from '@/lib/types/api-alerts';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type {
    EmergencyMapMarker,
    EmergencyMapOverlay,
} from '@/lib/types/mobile/emergency';

type PlaceType =
    | 'hospital'
    | 'pharmacy'
    | 'gas_station'
    | 'community_center'
    | 'school'
    | 'fire_station';

const PLACE_LAYER_MAP: Record<
    PlaceType,
    EmergencyMapMarker['layer']
> = {
    hospital: 'hospitals',
    pharmacy: 'resourceSites',
    gas_station: 'resourceSites',
    community_center: 'shelters',
    school: 'shelters',
    fire_station: 'resourceSites',
};

const INFRA_TYPES: PlaceType[] = [
    'hospital',
    'pharmacy',
    'gas_station',
    'community_center',
    'school',
    'fire_station',
];

function squarePolygon(
    lat: number,
    lng: number,
    halfDelta = 0.04,
): EmergencyMapOverlay['coordinates'] {
    return [
        { latitude: lat - halfDelta, longitude: lng - halfDelta },
        { latitude: lat - halfDelta, longitude: lng + halfDelta },
        { latitude: lat + halfDelta, longitude: lng + halfDelta },
        { latitude: lat + halfDelta, longitude: lng - halfDelta },
    ];
}

async function fetchNearbyPlaces(
    lat: number,
    lng: number,
    type: PlaceType,
    radiusM = 5000,
): Promise<EmergencyMapMarker[]> {
    if (!GOOGLE_MAPS_API_KEY) return [];

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`;

    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = (await res.json()) as {
            status?: string;
            results?: Array<{
                place_id?: string;
                name?: string;
                geometry?: { location?: { lat?: number; lng?: number } };
                vicinity?: string;
            }>;
        };
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];

        const layer = PLACE_LAYER_MAP[type];
        return (data.results ?? [])
            .filter((p) => p.geometry?.location?.lat != null && p.geometry?.location?.lng != null)
            .slice(0, 8)
            .map((place) => ({
                id: `place-${type}-${place.place_id}`,
                latitude: place.geometry!.location!.lat!,
                longitude: place.geometry!.location!.lng!,
                title: place.name ?? type,
                description: place.vicinity ?? undefined,
                layer,
            }));
    } catch {
        return [];
    }
}

function keywordLayer(title: string, description: string): EmergencyMapMarker['layer'] | null {
    const text = `${title} ${description}`.toLowerCase();
    if (/flood|river|gauge|nwps|water level/.test(text)) return 'floodZones';
    if (/road|highway|closure|detour|bridge/.test(text)) return 'roadClosures';
    if (/power|outage|electric|grid/.test(text)) return 'powerOutages';
    if (/water|boil|main break|sewer/.test(text)) return 'waterIssues';
    if (/shelter|evacuation center/.test(text)) return 'shelters';
    return null;
}

function unifiedSeverityToLayer(
    category: string,
    name: string,
    description: string,
): EmergencyMapMarker['layer'] {
    const kw = keywordLayer(name, description);
    if (kw) return kw;
    const cat = category.toLowerCase();
    if (cat === 'flood') return 'floodZones';
    if (cat === 'wildfire' || cat === 'storm') return 'riskAreas';
    return 'incidentReports';
}

export async function buildGisMapLayers(
    profile: UserProfilePayload | null,
    alerts: Array<{
        id: string;
        title: string;
        description?: string;
        severity: string;
        location: string;
        lat?: number;
        lng?: number;
    }>,
    incidents: Array<{
        id: string;
        title: string;
        description: string;
        lat?: number;
        lng?: number;
    }>,
): Promise<{ mapMarkers: EmergencyMapMarker[]; mapOverlays: EmergencyMapOverlay[] }> {
    const zones = buildUserZones(profile);
    const mapMarkers: EmergencyMapMarker[] = [];
    const mapOverlays: EmergencyMapOverlay[] = [];
    const seenMarkerIds = new Set<string>();

    const addMarker = (marker: EmergencyMapMarker) => {
        if (seenMarkerIds.has(marker.id)) return;
        seenMarkerIds.add(marker.id);
        mapMarkers.push(marker);
    };

    const searchCenters: { lat: number; lng: number; label: string }[] = [];
    for (const zone of zones) {
        const geo = await geocodeLocation(zone.locationString);
        if (geo) searchCenters.push({ lat: geo.lat, lng: geo.lon, label: zone.label });
    }

    const uniqueCenters: typeof searchCenters = [];
    for (const center of searchCenters) {
        const dup = uniqueCenters.some(
            (c) => Math.abs(c.lat - center.lat) < 0.02 && Math.abs(c.lng - center.lng) < 0.02,
        );
        if (!dup) uniqueCenters.push(center);
    }

    await Promise.all(
        uniqueCenters.flatMap((center) =>
            INFRA_TYPES.map(async (type) => {
                const places = await fetchNearbyPlaces(center.lat, center.lng, type);
                for (const place of places) addMarker(place);
            }),
        ),
    );

    // Removed fake scattered alerts loop that placed markers without coordinates around user's location.

    for (const inc of incidents) {
        if (inc.lat == null || inc.lng == null || !Number.isFinite(inc.lat) || !Number.isFinite(inc.lng)) continue;
        const layer = keywordLayer(inc.title, inc.description) ?? 'incidentReports';
        addMarker({
            id: `inc-${inc.id}`,
            latitude: inc.lat,
            longitude: inc.lng,
            title: inc.title,
            description: inc.description,
            layer,
        });
    }

    try {
        const preferState = preferStateFromProfile(profile);

        for (const alert of alerts) {
            const layer = keywordLayer(alert.title, alert.description ?? '') ?? 'incidentReports';

            let lat = alert.lat;
            let lon = alert.lng;

            if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                const stubAlert = {
                    id: alert.id,
                    title: alert.title,
                    description: alert.description ?? '',
                    timestamp: new Date().toISOString(),
                    severity: alert.severity,
                    source: AlertSource.WEATHER_API,
                    areaDesc: alert.location,
                    affectedAreas: alert.location ? [alert.location] : [],
                } satisfies Alert;
                const resolved = await resolveCoordsForMobileAlert(stubAlert, preferState);
                if (resolved) {
                    lat = resolved.lat;
                    lon = resolved.lon;
                } else if (preferState) {
                    const center = getStateCenterCoords(preferState);
                    if (center) {
                        lat = center.lat;
                        lon = center.lng;
                    } else {
                        continue;
                    }
                } else if (uniqueCenters[0]) {
                    lat = uniqueCenters[0].lat;
                    lon = uniqueCenters[0].lng;
                } else {
                    continue;
                }
            }

            if (isUsCenterFallbackCoords(lat, lon)) continue;
            if (!coordsInUserProfileStates(lat, lon, profile)) continue;

            addMarker({
                id: `mobile-alert-${alert.id}`,
                latitude: lat,
                longitude: lon,
                title: alert.title,
                description: alert.location,
                layer,
                severity: alert.severity,
                type: 'alert',
                lat,
                lng: lon,
            });
        }
    } catch (e) {
        console.error('gis-map-layers alerts:', e);
    }

    return { mapMarkers, mapOverlays };
}
