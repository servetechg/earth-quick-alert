import connectDB from '@/lib/mongodb';
import CommunityAlert from '@/models/CommunityAlert';
import WeatherAlertRecord from '@/models/WeatherAlertRecord';
import WeatherAlertTypeConfig from '@/models/WeatherAlertTypeConfig';
import { alertProcessor } from '@/lib/services/alert-processor';
import { Alert, AlertSource, AlertSeverity } from '@/lib/types/api-alerts';
import {
    geocodeLocation,
    locationMatchesAlertAreas,
} from '@/lib/services/location-matching';
import {
    fetchUnifiedEventsForMobileUser,
    unifiedSourceDisplay,
} from '@/lib/services/mobile/unified-event-mobile-alerts';
import {
    resolveLegacyAlertSourceUrl,
    resolveNwsAlertSourceUrl,
} from '@/lib/services/mobile/alert-source-url';
import { buildUserZones, type UserZone } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type { MobileAlertSeverity, MobileWeatherAlert } from '@/lib/types/mobile/alerts';

type WeatherAlertDoc = {
    alertId: string;
    source: string;
    event?: string;
    severity: string;
    title: string;
    description: string;
    timestamp: Date;
    expiresAt?: Date;
    coordinates?: { lat: number; lon: number };
    affectedAreas?: string[];
    areaDesc?: string;
    zones?: string[];
};

type UnifiedMobileAlert = Alert & {
    unifiedSource?: string;
    sourceDisplay?: string;
    sourceUrl?: string;
    unifiedProperties?: Record<string, Record<string, unknown>>;
};

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

function toRadians(value: number): number {
    return value * (Math.PI / 180);
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const earthRadiusKm = 6371;
    const dLat = toRadians(bLat - aLat);
    const dLon = toRadians(bLon - aLon);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const value =
        sinLat * sinLat +
        Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinLon * sinLon;
    const c = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    return earthRadiusKm * c;
}

function toMobileSeverity(value: string): MobileAlertSeverity {
    const n = (value || '').toLowerCase();
    if (n === 'extreme' || n === 'severe') return 'EXTREME';
    if (n === 'high') return 'HIGH';
    if (n === 'moderate' || n === 'medium') return 'MODERATE';
    return 'LOW';
}

function severityRank(s: MobileAlertSeverity): number {
    if (s === 'EXTREME') return 4;
    if (s === 'HIGH') return 3;
    if (s === 'MODERATE') return 2;
    return 1;
}

function legacySourceLabel(source: AlertSource): string {
    if (source === AlertSource.WEATHER_API) return 'NWS';
    if (source === AlertSource.EARTHQUAKE_API) return 'USGS';
    if (source === AlertSource.ADMIN_MANUAL) return 'COMMUNITY';
    return 'ALERT';
}

function resolveDisplaySource(alert: UnifiedMobileAlert): string {
    if (alert.sourceDisplay) return alert.sourceDisplay;
    if (alert.unifiedSource) return unifiedSourceDisplay(alert.unifiedSource);
    return legacySourceLabel(alert.source);
}

function expiresLabel(expiresAt?: string): string {
    if (!expiresAt) return 'EXPIRES: SEE ALERT DETAILS';
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime())) return `EXPIRES: ${expiresAt}`;
    return `EXPIRES: ${exp.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })}`;
}

function pickLocation(alert: Alert, zones: UserZone[]): string {
    const areas = alert.affectedAreas ?? [];
    if (areas.length > 0) return areas[0];
    if (alert.areaDesc) return alert.areaDesc.split(';')[0]?.trim() || alert.areaDesc;
    if (zones[0]) return zones[0].locationString;
    return 'Your area';
}

export async function fetchMobileAlertsForUser(
    userId: string,
    profile: UserProfilePayload | null,
): Promise<Alert[]> {
    await connectDB();

    const zones = buildUserZones(profile);
    const zoneStrings = zones.map((z) => z.locationString);
    if (zoneStrings.length === 0) return [];

    const geocodedLocations: { lat: number; lon: number; name: string }[] = [];
    for (const zone of zones) {
        const geocoded = await geocodeLocation(zone.locationString);
        if (geocoded) geocodedLocations.push(geocoded);
    }

    const now = new Date();
    const alertConfig: { events?: { name: string; enabled?: boolean; invalid?: boolean }[] } | null =
        (await WeatherAlertTypeConfig.findOne().lean()) as typeof alertConfig;
    const enabledEvents = new Set<string>(
        (alertConfig?.events || [])
            .filter((entry) => entry.enabled && !entry.invalid)
            .map((entry) => entry.name),
    );
    const hasConfig = Array.isArray(alertConfig?.events) && alertConfig.events.length > 0;

    const storedWeatherAlerts = (await WeatherAlertRecord.find({
        source: AlertSource.WEATHER_API,
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: now } },
        ],
    })
        .sort({ timestamp: -1 })
        .lean()) as unknown as WeatherAlertDoc[];

    const mergedWeatherMap = new Map<string, Alert>();
    const coordinateLocations = geocodedLocations.map((v) => ({
        lat: v.lat,
        lon: v.lon,
        name: v.name,
    }));

    for (const record of storedWeatherAlerts) {
        if (hasConfig && record.event && !enabledEvents.has(record.event)) continue;

        const matchedAreas = zoneStrings.filter((location) =>
            locationMatchesAlertAreas(
                location,
                record.affectedAreas || [],
                record.areaDesc,
                record.zones || [],
            ),
        );

        if (matchedAreas.length === 0 && record.coordinates && coordinateLocations.length > 0) {
            const nearby = coordinateLocations
                .filter(
                    (coords) =>
                        distanceKm(
                            coords.lat,
                            coords.lon,
                            record.coordinates!.lat,
                            record.coordinates!.lon,
                        ) <= 80,
                )
                .map((coords) => coords.name);
            matchedAreas.push(...nearby);
        }

        if (matchedAreas.length === 0) continue;

        const existing = mergedWeatherMap.get(record.alertId);
        mergedWeatherMap.set(record.alertId, {
            id: record.alertId,
            source: AlertSource.WEATHER_API,
            severity: record.severity as AlertSeverity,
            title: record.title,
            description: record.description,
            timestamp: new Date(record.timestamp).toISOString(),
            expiresAt: record.expiresAt ? new Date(record.expiresAt).toISOString() : undefined,
            affectedAreas: unique([...(existing?.affectedAreas || []), ...matchedAreas]),
            areaDesc: record.areaDesc,
            zones: record.zones || [],
            event: record.event,
            coordinates: record.coordinates,
            sourceUrl: resolveNwsAlertSourceUrl(record.alertId, {
                lat: record.coordinates?.lat,
                lon: record.coordinates?.lon,
                zones: record.zones,
                event: record.event || record.title,
                areaDesc: record.areaDesc,
            }),
            unifiedSource: 'nws',
        } as UnifiedMobileAlert);
    }

    const earthquakeAlerts: Alert[] = [];
    for (const location of geocodedLocations) {
        try {
            const fetched = await alertProcessor.fetchAllAlerts(
                { lat: location.lat, lon: location.lon },
                [AlertSource.EARTHQUAKE_API],
            );
            for (const alert of fetched) {
                const existing = earthquakeAlerts.find((item) => item.id === alert.id);
                if (!existing) {
                    earthquakeAlerts.push({
                        ...alert,
                        affectedAreas: unique([...(alert.affectedAreas || []), location.name]),
                        unifiedSource: 'earthquake',
                        sourceUrl: resolveLegacyAlertSourceUrl({
                            id: alert.id,
                            source: alert.source,
                            unifiedSource: 'earthquake',
                            sourceUrl:
                                'sourceUrl' in alert && typeof alert.sourceUrl === 'string'
                                    ? alert.sourceUrl
                                    : undefined,
                        }),
                    } as UnifiedMobileAlert);
                } else {
                    existing.affectedAreas = unique([
                        ...(existing.affectedAreas || []),
                        location.name,
                    ]);
                }
            }
        } catch (error) {
            console.error(`Mobile alerts: earthquake fetch for ${location.name}:`, error);
        }
    }

    const communityRaw = await CommunityAlert.find({
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: now } },
        ],
    })
        .sort({ timestamp: -1 })
        .lean();

    const userIdLower = userId.toLowerCase();
    const scopedZones = zoneStrings.map((z) => z.toLowerCase().trim()).filter(Boolean);

    const communityAlerts: Alert[] = communityRaw
        .filter((alert: Record<string, unknown>) => {
            const targetUsers = (Array.isArray(alert.targetUsers) ? alert.targetUsers : []).map(
                (v) => String(v).toLowerCase().trim(),
            );
            const affectedAreas = (Array.isArray(alert.affectedAreas) ? alert.affectedAreas : []).map(
                (v) => String(v).toLowerCase().trim(),
            );
            const targetsCurrentUser = targetUsers.includes(userIdLower);
            const targetsAll =
                targetUsers.includes('broadcast') || targetUsers.includes('all');
            const areaOverlap =
                affectedAreas.length === 0 ||
                affectedAreas.some((area) =>
                    scopedZones.some((zone) => area.includes(zone) || zone.includes(area)),
                );
            return targetsCurrentUser || targetsAll || areaOverlap;
        })
        .map((alert: Record<string, unknown>) => ({
            id: String(alert._id),
            source: AlertSource.ADMIN_MANUAL,
            severity: String(alert.severity || 'moderate') as AlertSeverity,
            title: String(alert.title),
            description: String(alert.description),
            timestamp: new Date(
                (alert.timestamp as Date) || (alert.createdAt as Date) || new Date(),
            ).toISOString(),
            expiresAt: alert.expiresAt
                ? new Date(alert.expiresAt as Date).toISOString()
                : undefined,
            affectedAreas: (alert.affectedAreas as string[]) || [],
        })) as Alert[];

    const unifiedAlerts = await fetchUnifiedEventsForMobileUser(profile);

    const merged = new Map<string, UnifiedMobileAlert>();
    const titleDedupe = new Set<string>();

    const addAlert = (alert: UnifiedMobileAlert) => {
        if (merged.has(alert.id)) return;
        const titleKey = `${alert.title.toLowerCase().trim()}|${alert.timestamp.slice(0, 13)}`;
        if (titleDedupe.has(titleKey)) return;
        titleDedupe.add(titleKey);
        merged.set(alert.id, alert);
    };

    for (const alert of unifiedAlerts) addAlert(alert);
    for (const alert of Array.from(mergedWeatherMap.values())) addAlert(alert);
    for (const alert of earthquakeAlerts) addAlert(alert);
    for (const alert of communityAlerts) addAlert(alert);

    const allAlerts = Array.from(merged.values());
    allAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allAlerts;
}

export function alertToMobileItem(
    alert: UnifiedMobileAlert,
    zones: UserZone[],
    readMap: Map<string, boolean>,
): MobileWeatherAlert {
    const severity = toMobileSeverity(String(alert.severity));
    const issuedAt = alert.timestamp;
    const expiresAt = alert.expiresAt;
    return {
        id: alert.id,
        severity,
        title: alert.title,
        location: pickLocation(alert, zones),
        source: resolveDisplaySource(alert),
        issuedAt,
        expiresAt,
        expiresLabel: expiresLabel(expiresAt),
        read: readMap.get(alert.id) === true,
        description: alert.description,
        sourceUrl: resolveLegacyAlertSourceUrl({
            id: alert.id,
            source: alert.source,
            unifiedSource: alert.unifiedSource,
            sourceUrl: alert.sourceUrl,
            description: alert.description,
            title: alert.title,
            event: alert.event,
            areaDesc: alert.areaDesc,
            zones: alert.zones,
            properties: alert.unifiedProperties,
            lat: alert.coordinates?.lat,
            lon: alert.coordinates?.lon,
        }),
    };
}

export function sortMobileAlerts(
    items: MobileWeatherAlert[],
    sort: 'recent' | 'severity',
): MobileWeatherAlert[] {
    const copy = [...items];
    if (sort === 'severity') {
        copy.sort((a, b) => {
            const diff = severityRank(b.severity) - severityRank(a.severity);
            if (diff !== 0) return diff;
            return new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
        });
    } else {
        copy.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
    }
    return copy;
}

export function filterMobileAlerts(
    items: MobileWeatherAlert[],
    opts: {
        severity?: MobileAlertSeverity;
        read?: boolean;
        q?: string;
    },
): MobileWeatherAlert[] {
    let out = items;
    if (opts.severity) {
        out = out.filter((a) => a.severity === opts.severity);
    }
    if (typeof opts.read === 'boolean') {
        out = out.filter((a) => a.read === opts.read);
    }
    if (opts.q?.trim()) {
        const q = opts.q.trim().toLowerCase();
        out = out.filter(
            (a) =>
                a.title.toLowerCase().includes(q) ||
                a.location.toLowerCase().includes(q) ||
                (a.description ?? '').toLowerCase().includes(q),
        );
    }
    return out;
}

export function deriveDashboardMode(alerts: MobileWeatherAlert[]): 'blue_sky' | 'cloudy' {
    const disruptive = alerts.some((a) => a.severity === 'EXTREME' || a.severity === 'HIGH');
    return disruptive ? 'cloudy' : 'blue_sky';
}
