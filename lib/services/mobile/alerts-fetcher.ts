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

function sourceLabel(source: AlertSource): string {
    if (source === AlertSource.WEATHER_API) return 'NWPS';
    if (source === AlertSource.EARTHQUAKE_API) return 'USGS';
    if (source === AlertSource.ADMIN_MANUAL) return 'COMMUNITY';
    return 'ALERT';
}

function expiresLabel(expiresAt?: string): string {
    if (!expiresAt) return 'EXPIRES: SEE GAUGE / NWPS';
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime())) return 'EXPIRES: SEE GAUGE / NWPS';
    return `EXPIRES: ${exp.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
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
        } as Alert);
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
                    });
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

    const allAlerts: Alert[] = [
        ...Array.from(mergedWeatherMap.values()),
        ...earthquakeAlerts,
        ...communityAlerts,
    ];

    allAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allAlerts;
}

export function alertToMobileItem(
    alert: Alert,
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
        source: sourceLabel(alert.source),
        issuedAt,
        expiresAt,
        expiresLabel: expiresLabel(expiresAt),
        read: readMap.get(alert.id) === true,
        description: alert.description,
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
