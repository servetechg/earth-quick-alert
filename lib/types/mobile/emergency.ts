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

export type GisMapLayerId =
    | 'weatherRadar'
    | 'riskAreas'
    | 'floodZones'
    | 'shelters'
    | 'hospitals'
    | 'roadClosures'
    | 'powerOutages'
    | 'waterIssues'
    | 'resourceSites'
    | 'incidentReports';

export type EmergencyMapMarker = {
    id: string;
    latitude: number;
    longitude: number;
    title: string;
    description?: string;
    layer: GisMapLayerId;
    severity?: string;
    /** @deprecated Legacy flat coords — use latitude/longitude */
    lat?: number;
    lng?: number;
    /** @deprecated Legacy type — use layer */
    type?: 'incident' | 'alert' | 'user';
};

export type EmergencyMapOverlay = {
    id: string;
    layer: Extract<GisMapLayerId, 'weatherRadar' | 'riskAreas' | 'floodZones'>;
    coordinates: Array<{ latitude: number; longitude: number }>;
    fillColor?: string;
    strokeColor?: string;
};

export type EmergencyMapResponse = {
    mapRegion: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    };
    mapMarkers: EmergencyMapMarker[];
    mapOverlays: EmergencyMapOverlay[];
    /** @deprecated Use mapMarkers */
    markers?: EmergencyMapMarker[];
};
