import type { UnifiedEventSource } from '@/lib/unified-event/types';

/** Legacy `AlertCommunication.source` values used by the admin UI badges. */
export type LegacyAlertSource =
    | 'nws'
    | 'usgs'
    | 'firms'
    | 'inciweb'
    | 'nwps'
    | 'fema'
    | 'earthquake'
    | 'noaa_ncei'
    | 'manual'
    | 'seed';

export function unifiedSourceToLegacy(source: string): LegacyAlertSource {
    const s = String(source ?? '').toLowerCase();
    if (s === 'nasa_firms') return 'firms';
    if (s === 'noaa_nwis') return 'usgs';
    if (s === 'noaa_ncei') return 'noaa_ncei';
    return (s as LegacyAlertSource) || 'manual';
}

export function legacySourceToUnified(source: string): UnifiedEventSource {
    const s = String(source ?? '').toLowerCase();
    if (s === 'firms') return 'nasa_firms';
    if (s === 'wfigs') return 'nasa_firms';
    if (s === 'ncei') return 'noaa_ncei';
    return s as UnifiedEventSource;
}

export function normalizeExternalId(source: UnifiedEventSource, externalId: string): string {
    const id = String(externalId ?? '').trim();
    if (!id) return id;
    const prefix = `${source}:`;
    if (id.includes(':') && (id.startsWith(prefix) || /^[a-z_]+:/i.test(id))) return id;
    return `${prefix}${id}`;
}
