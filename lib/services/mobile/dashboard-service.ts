import type { DashboardHomeQuery, DashboardHomeResponse, DashboardNewsItem } from '@/lib/types/mobile/dashboard';
import type { MobileWeatherAlert } from '@/lib/types/mobile/alerts';
import {
    buildStatusFromAlerts,
    getAllMobileAlertsForUser,
    getMobileUnreadCount,
} from '@/lib/services/mobile/alerts-service';
import { deriveDashboardMode } from '@/lib/services/mobile/alerts-fetcher';
import { getMobileWeatherCurrent } from '@/lib/services/mobile/weather-service';
import { listMobilePreparednessCategories } from '@/lib/services/mobile/preparedness-service';

const DEFAULT_INCLUDES = ['status', 'news', 'weather', 'alerts', 'preparedness'];

function communityAlertsToNews(alerts: MobileWeatherAlert[], limit: number): DashboardNewsItem[] {
    return alerts
        .filter((a) => a.source === 'COMMUNITY')
        .slice(0, limit)
        .map((a) => ({
            id: a.id,
            title: a.title,
            body: a.description ?? a.title,
            timestamp: a.issuedAt,
            source: 'community' as const,
            severity:
                a.severity === 'EXTREME' || a.severity === 'HIGH'
                    ? ('critical' as const)
                    : ('warning' as const),
            category: 'ADVISORY',
            location: a.location,
            icon: 'shield-checkmark-outline',
        }));
}

export async function buildDashboardHome(
    userId: string,
    query: DashboardHomeQuery = {},
): Promise<DashboardHomeResponse> {
    const include = new Set(
        (query.include?.length ? query.include : DEFAULT_INCLUDES).map((s) => s.toLowerCase()),
    );
    const newsLimit = query.newsLimit ?? 4;
    const alertsLimit = query.alertsLimit ?? 2;

    const allAlerts = await getAllMobileAlertsForUser(userId);
    const mode = deriveDashboardMode(allAlerts);
    const unreadAlerts = await getMobileUnreadCount(userId);

    const response: DashboardHomeResponse = {
        mode,
        status: buildStatusFromAlerts(allAlerts),
        news: [],
        weather: null,
        recentAlerts: [],
        preparednessCategories: [],
        badges: { unreadAlerts },
    };

    if (include.has('status')) {
        response.status = buildStatusFromAlerts(allAlerts);
    }

    if (include.has('news')) {
        const community = communityAlertsToNews(allAlerts, newsLimit);
        if (community.length > 0) {
            response.news = community;
        } else {
            response.news = allAlerts.slice(0, newsLimit).map((a) => ({
                id: a.id,
                title: a.title,
                body: a.description ?? a.title,
                timestamp: a.issuedAt,
                source: 'emergency' as const,
                severity:
                    a.severity === 'EXTREME' || a.severity === 'HIGH'
                        ? ('critical' as const)
                        : ('warning' as const),
                category: a.severity,
                location: a.location,
                icon: 'warning-outline',
            }));
        }
    }

    if (include.has('weather')) {
        try {
            response.weather = await getMobileWeatherCurrent(userId);
        } catch {
            response.weather = null;
        }
    }

    if (include.has('alerts')) {
        response.recentAlerts = allAlerts.slice(0, alertsLimit);
    }

    if (include.has('preparedness')) {
        const { items } = await listMobilePreparednessCategories(userId);
        response.preparednessCategories = items.slice(0, 4);
    }

    return response;
}
