import connectDB from '@/lib/mongodb';
import IncidentReport from '@/models/IncidentReport';
import { geocodeLocation } from '@/lib/services/location-matching';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import { buildGisMapLayers } from '@/lib/services/mobile/gis-map-layers';
import { buildUserZones, paginate } from '@/lib/services/mobile/zone-utils';
import {
    buildStatusFromAlerts,
    getAllMobileAlertsForUser,
} from '@/lib/services/mobile/alerts-service';
import { deriveDashboardMode } from '@/lib/services/mobile/alerts-fetcher';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type {
    EmergencyIncident,
    EmergencyMapResponse,
    EmergencyNewsResponse,
} from '@/lib/types/mobile/emergency';
import type { DashboardNewsItem } from '@/lib/types/mobile/dashboard';

function alertsToNewsItems(
    alerts: Awaited<ReturnType<typeof getAllMobileAlertsForUser>>,
    limit: number,
): DashboardNewsItem[] {
    return alerts.slice(0, limit).map((a) => ({
        id: a.id,
        title: a.title,
        body: a.description ?? a.title,
        timestamp: a.issuedAt,
        source: a.source === 'COMMUNITY' ? ('community' as const) : ('emergency' as const),
        severity:
            a.severity === 'EXTREME' || a.severity === 'HIGH'
                ? ('critical' as const)
                : ('warning' as const),
        category: a.severity,
        location: a.location,
        icon: 'newspaper-outline',
    }));
}

export async function getEmergencyStatus(userId: string) {
    const alerts = await getAllMobileAlertsForUser(userId);
    return {
        mode: deriveDashboardMode(alerts),
        status: buildStatusFromAlerts(alerts),
    };
}

export async function getEmergencyNews(
    userId: string,
    page = 1,
    limit = 20,
    category?: string,
): Promise<EmergencyNewsResponse> {
    let alerts = await getAllMobileAlertsForUser(userId);
    if (category?.trim()) {
        const c = category.trim().toUpperCase();
        alerts = alerts.filter((a) => a.severity === c || a.source.toUpperCase().includes(c));
    }
    const items = alertsToNewsItems(alerts, alerts.length);
    const paged = paginate(items, page, limit);
    return {
        items: paged.items,
        page: paged.page,
        limit: paged.limit,
        total: paged.total,
        hasMore: paged.hasMore,
    };
}

export async function getEmergencyIncidents(userId: string): Promise<EmergencyIncident[]> {
    await connectDB();
    const profile = (await loadUserProfile(userId)) as UserProfilePayload | null;
    const zones = buildUserZones(profile);
    const zoneStrings = zones.map((z) => z.locationString.toLowerCase());

    const reports = await IncidentReport.find({}).sort({ createdAt: -1 }).limit(50).lean();

    return reports
        .filter((r: Record<string, unknown>) => {
            const loc = String(r.location ?? '').toLowerCase();
            if (!loc) return false;
            if (zoneStrings.length === 0) return true;
            return zoneStrings.some((z) => loc.includes(z) || z.includes(loc));
        })
        .slice(0, 20)
        .map((r: Record<string, unknown>) => ({
            id: String(r._id),
            title: String(r.title ?? r.type ?? 'Incident'),
            description: String(r.description ?? ''),
            location: String(r.location ?? ''),
            severity: String(r.severity ?? 'moderate'),
            reportedAt: new Date((r.createdAt as Date) ?? new Date()).toISOString(),
            lat: r.lat != null && r.lat !== '' && Number.isFinite(Number(r.lat)) ? Number(r.lat) : undefined,
            lng: r.lng != null && r.lng !== '' && Number.isFinite(Number(r.lng)) ? Number(r.lng) : undefined,
        }));
}

function computeMapRegion(
    userLat: number,
    userLng: number,
    markers: Array<{ latitude: number; longitude: number }>,
    zonesCount: number,
): EmergencyMapResponse['mapRegion'] {
    const minLat = markers.reduce((m, p) => Math.min(m, p.latitude), userLat);
    const maxLat = markers.reduce((m, p) => Math.max(m, p.latitude), userLat);
    const minLng = markers.reduce((m, p) => Math.min(m, p.longitude), userLng);
    const maxLng = markers.reduce((m, p) => Math.max(m, p.longitude), userLng);

    const latSpan = Math.max(0.08, maxLat - minLat);
    const lngSpan = Math.max(0.08, maxLng - minLng);
    const latitudeDelta = Math.min(12, Math.max(0.15, latSpan * 1.5 + 0.12));
    const longitudeDelta = Math.min(12, Math.max(0.15, lngSpan * 1.5 + 0.12));

    return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: zonesCount > 1 ? Math.max(latitudeDelta, 0.35) : latitudeDelta,
        longitudeDelta: zonesCount > 1 ? Math.max(longitudeDelta, 0.35) : longitudeDelta,
    };
}

export async function getEmergencyMap(userId: string): Promise<EmergencyMapResponse | null> {
    const profile = (await loadUserProfile(userId)) as UserProfilePayload | null;
    const zones = buildUserZones(profile);
    const primary = zones[0];
    if (!primary) return null;

    const geo = await geocodeLocation(primary.locationString);
    if (!geo) return null;

    const alerts = await getAllMobileAlertsForUser(userId);
    const incidents = await getEmergencyIncidents(userId);

    const { mapMarkers, mapOverlays } = await buildGisMapLayers(
        profile,
        alerts.map((a) => ({
            id: a.id,
            title: a.title,
            description: a.description,
            severity: a.severity,
            location: a.location,
            lat: a.coordinates?.lat,
            lng: a.coordinates?.lon,
        })),
        incidents,
    );

    const latitudeDelta = zones.length > 1 ? 0.35 : 0.15;
    const longitudeDelta = zones.length > 1 ? 0.35 : 0.15;

    const mapRegion =
        mapMarkers.length > 0
            ? computeMapRegion(geo.lat, geo.lon, mapMarkers, zones.length)
            : {
                  latitude: geo.lat,
                  longitude: geo.lon,
                  latitudeDelta,
                  longitudeDelta,
              };

    return {
        mapRegion,
        mapMarkers,
        mapOverlays,
        markers: mapMarkers,
    };
}
