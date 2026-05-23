/** Ready2Go Unified Event Model v1 — shared types for ingest, storage, and API adapters. */

export const UNIFIED_EVENT_CATEGORIES = [
    'flood',
    'earthquake',
    'wildfire',
    'storm',
    'marine',
    'coastal_surf',
    'hazardous',
    'tsunami',
    'volcanic',
    'landslide',
    'winter_weather',
    'air_quality',
    'extreme_heat',
    'fema_declaration',
] as const;

export type UnifiedEventCategory = (typeof UNIFIED_EVENT_CATEGORIES)[number];

export const UNIFIED_EVENT_SOURCES = [
    'nws',
    'usgs',
    'earthquake',
    'nwps',
    'fema',
    'nasa_firms',
    'inciweb',
    'noaa_nwis',
    'noaa_ncei',
    'manual',
    'seed',
] as const;

export type UnifiedEventSource = (typeof UNIFIED_EVENT_SOURCES)[number];

export type UnifiedSeverity = 'Low' | 'Moderate' | 'High' | 'Extreme';
export type UnifiedAlertType = 'Warning' | 'Watch' | 'Advisory' | 'Statement' | 'Declaration';
export type UnifiedIconType = 'cloud' | 'triangle' | 'lightning' | 'flame' | 'wave' | 'snowflake' | 'wind';
export type UnifiedUserStatus = 'Take Action' | 'Monitor' | 'Info';
export type UnifiedDataStatus = 'current' | 'past';

export interface IntensityMeasurement {
    metric: string;
    value: number;
    unit: string;
    display: string;
    secondaryMetric?: string | null;
    secondaryValue?: number | null;
    secondaryUnit?: string | null;
}

export type CategoryProperties = Record<string, unknown>;

export interface UnifiedEventInsert {
    externalId: string;
    source: UnifiedEventSource;
    category: UnifiedEventCategory;
    name: string;
    description?: string;
    severity: UnifiedSeverity;
    type: UnifiedAlertType;
    iconType: UnifiedIconType;
    status: UnifiedUserStatus;
    location: string;
    lat?: number | null;
    lng?: number | null;
    coordinates?: { lat: number; lng: number } | null;
    geometry?: { type: string; coordinates: unknown } | null;
    issuedAt: string;
    expiresAt: string;
    instructions?: string[];
    properties?: CategoryProperties;
}
