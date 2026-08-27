/** Mobile v1 — Alerts tab & Home preview */

export type MobileAlertSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';

export type MobileWeatherAlert = {
    id: string;
    severity: MobileAlertSeverity;
    title: string;
    location: string;
    source: string;
    issuedAt: string;
    expiresAt?: string;
    expiresLabel: string;
    read: boolean;
    description?: string;
    /** Official source page (NWS, USGS, etc.) */
    sourceUrl?: string;
    /** Geocoded coordinates of the alert, if available */
    coordinates?: { lat: number; lon: number };
};

export type MobileAlertsListResponse = {
    items: MobileWeatherAlert[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    unreadCount: number;
};

export type MobileAlertsListQuery = {
    sort?: 'recent' | 'severity';
    severity?: MobileAlertSeverity;
    read?: boolean;
    q?: string;
    page?: number;
    limit?: number;
};
