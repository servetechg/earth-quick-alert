import connectDB from '@/lib/mongodb';
import CommunityAlert from '@/models/CommunityAlert';
import { Alert, AlertSource, AlertSeverity } from '@/lib/types/api-alerts';
import { buildUserZones, type UserZone } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type { MobileAlertSeverity, MobileWeatherAlert } from '@/lib/types/mobile/alerts';
import {
    fetchUnifiedEventsForMobileUser,
    unifiedSourceDisplay,
} from '@/lib/services/mobile/unified-event-mobile-alerts';

type UnifiedMobileAlert = Alert & { unifiedSource?: string };

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
    if (source === AlertSource.WEATHER_API) return 'NWPS';
    if (source === AlertSource.EARTHQUAKE_API) return 'USGS';
    if (source === AlertSource.ADMIN_MANUAL) return 'COMMUNITY';
    return 'ALERT';
}

function resolveDisplaySource(alert: Alert): string {
    const unified = alert as UnifiedMobileAlert;
    if (unified.unifiedSource) return unifiedSourceDisplay(unified.unifiedSource);
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
    if (zones.length === 0) return [];

    const unifiedAlerts = await fetchUnifiedEventsForMobileUser(profile);

    const now = new Date();
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
    const scopedZones = zones.map((z) => z.locationString.toLowerCase().trim()).filter(Boolean);

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

    const allAlerts: Alert[] = [...unifiedAlerts, ...communityAlerts];

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
        source: resolveDisplaySource(alert),
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
