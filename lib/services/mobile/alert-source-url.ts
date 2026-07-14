import type { AlertSource } from '@/lib/types/api-alerts';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';

const NWS_ALERTS_BASE = 'https://api.weather.gov/alerts';
const USGS_EVENT_BASE = 'https://earthquake.usgs.gov/earthquakes/eventpage';
const FEMA_DISASTER_BASE = 'https://www.fema.gov/disaster';
const WEATHER_GOV = 'https://www.weather.gov';

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

function stripUnifiedPrefix(externalId: string, source?: string): string {
    const id = externalId.trim();
    if (!id) return '';
    if (source) {
        const prefix = `${source.toLowerCase()}:`;
        if (id.toLowerCase().startsWith(prefix)) {
            return id.slice(prefix.length).trim();
        }
    }
    const colon = id.indexOf(':');
    if (colon > 0 && /^[a-z_]+$/i.test(id.slice(0, colon))) {
        return id.slice(colon + 1).trim();
    }
    return id;
}

/** NWS alert ids are often full api.weather.gov URLs or URNs. */
export function resolveNwsAlertSourceUrl(alertId: string): string | undefined {
    const id = alertId.trim();
    if (!id) return undefined;
    if (isHttpUrl(id)) return id;
    if (id.startsWith('urn:')) {
        return `${NWS_ALERTS_BASE}/${encodeURIComponent(id)}`;
    }
    return `${NWS_ALERTS_BASE}/${encodeURIComponent(id)}`;
}

export function resolveUsgsEarthquakeSourceUrl(eventId: string, explicitUrl?: string): string | undefined {
    const url = explicitUrl?.trim();
    if (url && isHttpUrl(url)) return url;
    const id = eventId.trim().replace(/^eq:/i, '');
    if (!id) return undefined;
    return `${USGS_EVENT_BASE}/${encodeURIComponent(id)}`;
}

export function resolveInciWebSourceUrl(externalIdOrLink: string): string | undefined {
    const raw = stripUnifiedPrefix(externalIdOrLink, 'inciweb');
    if (!raw) return undefined;
    if (isHttpUrl(raw)) return raw;
    return undefined;
}

export function resolveFemaSourceUrl(externalId: string): string | undefined {
    const raw = stripUnifiedPrefix(externalId, 'fema');
    if (!raw) return undefined;
    if (isHttpUrl(raw)) return raw;
    const disasterNum = raw.match(/DR-(\d+)/i)?.[1] ?? raw.match(/^(\d+)$/)?.[1];
    if (disasterNum) return `${FEMA_DISASTER_BASE}/${disasterNum}`;
    return undefined;
}

export function resolveUnifiedEventSourceUrl(doc: UnifiedEventDoc): string | undefined {
    const source = String(doc.source ?? '').toLowerCase();
    const externalId = String(doc.externalId ?? doc._id ?? '');

    if (source === 'nws' || source === 'nwps') {
        const nwsId = stripUnifiedPrefix(externalId, source);
        return resolveNwsAlertSourceUrl(nwsId || externalId);
    }

    if (source === 'earthquake' || source === 'usgs') {
        const eq = doc.properties?.earthquake as { usgsEventUrl?: string; usgsEventId?: string } | undefined;
        const eventId = String(eq?.usgsEventId ?? stripUnifiedPrefix(externalId, source));
        return resolveUsgsEarthquakeSourceUrl(eventId, eq?.usgsEventUrl);
    }

    if (source === 'inciweb') {
        return resolveInciWebSourceUrl(externalId);
    }

    if (source === 'fema') {
        return resolveFemaSourceUrl(externalId);
    }

    const stripped = stripUnifiedPrefix(externalId, source);
    if (isHttpUrl(stripped)) return stripped;

    if (source === 'nws' || source.includes('weather')) {
        return WEATHER_GOV;
    }

    return undefined;
}

export function resolveLegacyAlertSourceUrl(
    alert: {
        id: string;
        source: AlertSource | string;
        unifiedSource?: string;
        sourceUrl?: string;
        properties?: Record<string, Record<string, unknown>>;
    },
): string | undefined {
    if (alert.sourceUrl?.trim()) return alert.sourceUrl.trim();

    const unifiedSource = String(alert.unifiedSource ?? '').toLowerCase();
    const legacySource = String(alert.source ?? '').toLowerCase();

    if (unifiedSource === 'nws' || unifiedSource === 'nwps' || legacySource.includes('weather')) {
        return resolveNwsAlertSourceUrl(alert.id);
    }

    if (unifiedSource === 'earthquake' || unifiedSource === 'usgs' || legacySource.includes('earthquake')) {
        const eq = alert.properties?.earthquake as { usgsEventUrl?: string; usgsEventId?: string } | undefined;
        return resolveUsgsEarthquakeSourceUrl(
            eq?.usgsEventId ? String(eq.usgsEventId) : alert.id,
            eq?.usgsEventUrl ? String(eq.usgsEventUrl) : undefined,
        );
    }

    if (unifiedSource === 'inciweb') {
        return resolveInciWebSourceUrl(alert.id);
    }

    if (unifiedSource === 'fema') {
        return resolveFemaSourceUrl(alert.id);
    }

    const stripped = stripUnifiedPrefix(alert.id, unifiedSource);
    if (isHttpUrl(stripped)) return stripped;

    return undefined;
}
