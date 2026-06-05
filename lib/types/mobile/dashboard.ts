import type { MobileWeatherAlert } from '@/lib/types/mobile/alerts';
import type { MobilePreparednessCategory } from '@/lib/types/mobile/preparedness';
import type { MobileWeatherSnapshot } from '@/lib/types/mobile/weather';

export type DashboardMode = 'blue_sky' | 'cloudy';

export type DashboardStatus = {
    headline: string;
    summary: string;
    severity: MobileWeatherAlert['severity'];
    updatedAt: string;
};

export type DashboardNewsItem = {
    id: string;
    title: string;
    body: string;
    timestamp: string;
    source: 'emergency' | 'community' | 'nws';
    severity: 'info' | 'warning' | 'critical';
    category: string;
    location: string;
    icon: string;
};

export type DashboardHomeResponse = {
    mode: DashboardMode;
    status: DashboardStatus;
    news: DashboardNewsItem[];
    weather: MobileWeatherSnapshot | null;
    recentAlerts: MobileWeatherAlert[];
    preparednessCategories: MobilePreparednessCategory[];
    badges: { unreadAlerts: number };
};

export type DashboardHomeQuery = {
    include?: string[];
    newsLimit?: number;
    alertsLimit?: number;
};
