import connectDB from '@/lib/mongodb';
import MobileAlertRead from '@/models/MobileAlertRead';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import {
    alertToMobileItem,
    buildMobileWeatherAlerts,
    deriveDashboardMode,
    fetchMobileAlertsForUser,
    filterMobileAlerts,
    sortMobileAlerts,
} from '@/lib/services/mobile/alerts-fetcher';
import { buildUserZones, paginate } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type {
    MobileAlertsListQuery,
    MobileAlertsListResponse,
    MobileWeatherAlert,
} from '@/lib/types/mobile/alerts';
import type { DashboardMode } from '@/lib/types/mobile/dashboard';

async function loadReadMap(userId: string): Promise<Map<string, boolean>> {
    await connectDB();
    const rows = await MobileAlertRead.find({ userId, read: true }).lean();
    const map = new Map<string, boolean>();
    for (const row of rows) {
        map.set(row.alertId, true);
    }
    return map;
}

async function loadProfileForUser(userId: string): Promise<UserProfilePayload | null> {
    const profile = await loadUserProfile(userId);
    return profile as UserProfilePayload | null;
}

export async function listMobileAlerts(
    userId: string,
    query: MobileAlertsListQuery = {},
): Promise<MobileAlertsListResponse> {
    const profile = await loadProfileForUser(userId);
    const zones = buildUserZones(profile);
    const raw = await fetchMobileAlertsForUser(userId, profile);
    const readMap = await loadReadMap(userId);
    let items = await buildMobileWeatherAlerts(raw, profile, zones, readMap);
    items = sortMobileAlerts(items, query.sort ?? 'recent');
    const unreadCount = items.filter((a) => !a.read).length;

    items = filterMobileAlerts(items, {
        severity: query.severity,
        read: query.read,
        q: query.q,
    });
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const paged = paginate(items, page, limit);

    return {
        items: paged.items,
        page: paged.page,
        limit: paged.limit,
        total: paged.total,
        hasMore: paged.hasMore,
        unreadCount,
    };
}

export async function getAllMobileAlertsForUser(userId: string): Promise<MobileWeatherAlert[]> {
    const profile = await loadProfileForUser(userId);
    const zones = buildUserZones(profile);
    const raw = await fetchMobileAlertsForUser(userId, profile);
    const readMap = await loadReadMap(userId);
    return buildMobileWeatherAlerts(raw, profile, zones, readMap);
}

export async function getMobileAlertById(
    userId: string,
    alertId: string,
): Promise<MobileWeatherAlert | null> {
    const items = await getAllMobileAlertsForUser(userId);
    return items.find((a) => a.id === alertId) ?? null;
}

export async function getMobileUnreadCount(userId: string): Promise<number> {
    const items = await getAllMobileAlertsForUser(userId);
    return items.filter((a) => !a.read).length;
}

export async function setMobileAlertRead(
    userId: string,
    alertId: string,
    read: boolean,
): Promise<number> {
    await connectDB();
    if (read) {
        await MobileAlertRead.findOneAndUpdate(
            { userId, alertId },
            { $set: { read: true, readAt: new Date() } },
            { upsert: true, new: true },
        );
    } else {
        await MobileAlertRead.deleteOne({ userId, alertId });
    }
    return getMobileUnreadCount(userId);
}

export async function markAllMobileAlertsRead(userId: string): Promise<number> {
    const items = await getAllMobileAlertsForUser(userId);
    await connectDB();
    const ops = items
        .filter((a) => !a.read)
        .map((a) =>
            MobileAlertRead.findOneAndUpdate(
                { userId, alertId: a.id },
                { $set: { read: true, readAt: new Date() } },
                { upsert: true },
            ),
        );
    await Promise.all(ops);
    return 0;
}

export async function getDashboardModeForUser(userId: string): Promise<DashboardMode> {
    const items = await getAllMobileAlertsForUser(userId);
    return deriveDashboardMode(items);
}

export function buildStatusFromAlerts(alerts: MobileWeatherAlert[]) {
    const top = sortMobileAlerts(alerts, 'severity')[0];
    if (!top) {
        return {
            headline: 'All clear in your area',
            summary: 'No active watches or warnings for your registered locations.',
            severity: 'LOW' as const,
            updatedAt: new Date().toISOString(),
        };
    }
    return {
        headline:
            top.severity === 'EXTREME' || top.severity === 'HIGH'
                ? 'Active disruption in your area'
                : 'Weather advisory in your area',
        summary: `${top.title} — ${top.location}`,
        severity: top.severity,
        updatedAt: top.issuedAt,
    };
}
