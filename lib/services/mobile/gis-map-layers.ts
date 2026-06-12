import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';
import { geocodeLocation } from '@/lib/services/location-matching';
import { getCurrentEvents } from '@/lib/services/unified-event-repo';
import { fetchUnifiedEventsForMobileUser } from '@/lib/services/mobile/unified-event-mobile-alerts';
import { unifiedSourceToLegacy } from '@/lib/unified-event/legacy-source';
import { alertRowMatchesAiAlignedStateScope } from '@/lib/utils/alert-location-state-match';
import { buildUserZones } from '@/lib/services/mobile/zone-utils';
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

function statesFromProfile(profile: UserProfilePayload | null): string[] {
    const states = new Set<string>();
    const addrState = profile?.address?.state?.trim();
    if (addrState) states.add(addrState);
    for (const loc of profile?.alertLocations ?? []) {
        if (loc.state?.trim()) states.add(loc.state.trim());
    }
    return [...states];
}

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
    const states = statesFromProfile(profile);
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

    for (const alert of alerts) {
        const layer =
            keywordLayer(alert.title, alert.description ?? alert.location) ?? 'incidentReports';
        const center = uniqueCenters[0];
        if (!center) continue;
        const idx = mapMarkers.length;
        addMarker({
            id: `alert-${alert.id}`,
            latitude: center.lat + (idx % 5) * 0.008 - 0.016,
            longitude: center.lng + (idx % 4) * 0.006 - 0.012,
            title: alert.title,
            description: alert.location,
            layer,
            severity: alert.severity,
        });

        if (layer === 'floodZones' || layer === 'riskAreas' || alert.severity === 'HIGH' || alert.severity === 'EXTREME') {
            const overlayLayer =
                layer === 'floodZones'
                    ? 'floodZones'
                    : alert.severity === 'EXTREME' || alert.severity === 'HIGH'
                      ? 'riskAreas'
                      : 'weatherRadar';
            mapOverlays.push({
                id: `overlay-alert-${alert.id}`,
                layer: overlayLayer,
                coordinates: squarePolygon(
                    center.lat + (idx % 5) * 0.008 - 0.016,
                    center.lng + (idx % 4) * 0.006 - 0.012,
                    overlayLayer === 'floodZones' ? 0.06 : 0.045,
                ),
            });
        }
    }

    for (const inc of incidents) {
        if (inc.lat == null || inc.lng == null) continue;
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
        const unified = await fetchUnifiedEventsForMobileUser(profile);
        const events = await getCurrentEvents();
        const stateEvents = events.filter((doc) =>
            states.some((state) =>
                alertRowMatchesAiAlignedStateScope(
                    {
                        source: unifiedSourceToLegacy(doc.source),
                        location: doc.location ?? '',
                        description: doc.description ?? '',
                        name: doc.name ?? '',
                        instructions: doc.instructions ?? [],
                    },
                    state,
                ),
            ),
        );

        for (const doc of stateEvents.slice(0, 12)) {
            const layer = unifiedSeverityToLayer(doc.category, doc.name, doc.description ?? '');
            const lat = doc.lat ?? uniqueCenters[0]?.lat;
            const lng = doc.lng ?? uniqueCenters[0]?.lng;
            if (lat == null || lng == null) continue;

            addMarker({
                id: `unified-${doc.externalId}`,
                latitude: lat,
                longitude: lng,
                title: doc.name,
                description: doc.location,
                layer,
                severity: doc.severity,
            });

            if (layer === 'floodZones' || layer === 'riskAreas' || doc.category === 'flood') {
                mapOverlays.push({
                    id: `overlay-unified-${doc.externalId}`,
                    layer: layer === 'floodZones' || doc.category === 'flood' ? 'floodZones' : 'riskAreas',
                    coordinates: squarePolygon(lat, lng, doc.category === 'flood' ? 0.08 : 0.05),
                });
            }
        }

        for (const alert of unified.slice(0, 6)) {
            const layer = keywordLayer(alert.title, alert.description ?? '') ?? 'incidentReports';
            const center = uniqueCenters[0];
            if (!center) continue;
            addMarker({
                id: `mobile-alert-${alert.id}`,
                latitude: center.lat,
                longitude: center.lng,
                title: alert.title,
                description: alert.location,
                layer,
                severity: alert.severity,
            });
        }
    } catch (e) {
        console.error('gis-map-layers unified:', e);
    }

    return { mapMarkers, mapOverlays };
}
