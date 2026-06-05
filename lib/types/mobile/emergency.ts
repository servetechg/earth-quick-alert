import type { DashboardMode, DashboardStatus } from '@/lib/types/mobile/dashboard';
import type { DashboardNewsItem } from '@/lib/types/mobile/dashboard';

export type EmergencyStatusResponse = {
    mode: DashboardMode;
    status: DashboardStatus;
};

export type EmergencyNewsResponse = {
    items: DashboardNewsItem[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
};

export type EmergencyIncident = {
    id: string;
    title: string;
    description: string;
    location: string;
    severity: string;
    reportedAt: string;
    lat?: number;
    lng?: number;
};

export type EmergencyMapMarker = {
    id: string;
    lat: number;
    lng: number;
    title: string;
    type: 'incident' | 'alert' | 'user';
    severity?: string;
};

export type EmergencyMapResponse = {
    mapRegion: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    };
    markers: EmergencyMapMarker[];
};
