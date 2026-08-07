import type { AlertSource } from '@/lib/types/api-alerts';
import type { UnifiedEventDoc } from '@/lib/services/unified-event-repo';

const WEATHER_GOV = 'https://www.weather.gov';
const RADAR_WEATHER_GOV = 'https://radar.weather.gov';
const FORECAST_MAPCLICK = 'https://forecast.weather.gov/MapClick.php';
const FORECAST_SHOWSIGWX = 'https://forecast.weather.gov/showsigwx.php';
const USGS_EQ_BASE = 'https://earthquake.usgs.gov/earthquakes/eventpage';
const USGS_WATER_BASE = 'https://waterdata.usgs.gov/monitoring-location';
const USGS_WATER_HOME = 'https://waterdata.usgs.gov';
const FEMA_DISASTER_BASE = 'https://www.fema.gov/disaster';
const FEMA_DISASTERS_HOME = 'https://www.fema.gov/disasters';
const NWPS_GAUGE_BASE = 'https://water.noaa.gov/gauges';
const NWPS_HOME = 'https://water.noaa.gov';
const FIRMS_MAP_BASE = 'https://firms.modaps.eosdis.nasa.gov/map';
const FIRMS_HOME = 'https://firms.modaps.eosdis.nasa.gov';
const INCIWEB_HOME = 'https://inciweb.wildfire.gov';

export type NwsSourceContext = {
    lat?: number | null;
    lng?: number | null;
    lon?: number | null;
    zones?: string[] | null;
    event?: string | null;
    areaDesc?: string | null;
};

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

/** Strip one or more known source prefixes (`nwps:`, `gauge:`, `usgs:`, …). */
function stripSourcePrefixes(externalId: string, ...sources: string[]): string {
    let id = externalId.trim();
    if (!id) return '';

    for (const source of sources) {
        const prefix = `${source.toLowerCase()}:`;
        if (id.toLowerCase().startsWith(prefix)) {
            id = id.slice(prefix.length).trim();
        }
    }

    // Generic first-token prefix: `foo:rest` when foo is a short source key.
    const colon = id.indexOf(':');
    if (colon > 0 && /^[a-z_]{2,20}$/i.test(id.slice(0, colon))) {
        const head = id.slice(0, colon).toLowerCase();
        const known = new Set(
            [
                'nws',
                'nwps',
                'usgs',
                'eq',
                'earthquake',
                'firms',
                'nasa_firms',
                'inciweb',
                'fema',
                'gauge',
                'manual',
                'seed',
                'noaa_nwis',
                'noaa_ncei',
            ].concat(sources.map((s) => s.toLowerCase())),
        );
        if (known.has(head)) {
            id = id.slice(colon + 1).trim();
        }
    }

    return id;
}

/** Typical NWSLI gauge ids (e.g. CFMM8, HARP1) — not NWS CAP alert ids. */
function looksLikeNwpsGaugeLid(id: string): boolean {
    const lid = id.replace(/^gauge:/i, '').trim();
    return /^[A-Za-z]{4}\d$/i.test(lid) || /^[A-Za-z]{3}\d{2}$/i.test(lid);
}

/** USGS NWIS site numbers are numeric (often 8–15 digits). */
function looksLikeUsgsSiteNumber(id: string): boolean {
    const raw = id.replace(/^USGS-/i, '').trim();
    return /^\d{8,15}$/.test(raw);
}

function isApiWeatherGovUrl(url: string): boolean {
    return /api\.weather\.gov/i.test(url.trim());
}

/** Human NWS pages only — never the machine JSON API. */
function isConsumerFriendlyNwsUrl(url: string): boolean {
    const v = url.trim();
    if (!isHttpUrl(v) || isApiWeatherGovUrl(v)) return false;
    return /(^|\.)weather\.gov|(^|\.)weather\.noaa\.gov/i.test(v);
}

function normalizeNwsCoords(context?: NwsSourceContext | null): { lat: number; lon: number } | null {
    if (!context) return null;
    const lat = context.lat != null ? Number(context.lat) : NaN;
    const lonRaw = context.lng ?? context.lon;
    const lon = lonRaw != null ? Number(lonRaw) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    // Skip the continental-US centroid used as a sync fallback — not a real alert point.
    if (Math.abs(lat - 39.8283) < 0.0001 && Math.abs(lon - -98.5795) < 0.0001) return null;
    return { lat, lon };
}

function pickNwsZoneParams(zones?: string[] | null): { warnzone?: string; warncounty?: string } {
    let warnzone: string | undefined;
    let warncounty: string | undefined;
    for (const raw of zones ?? []) {
        const z = String(raw ?? '')
            .trim()
            .toUpperCase()
            .replace(/^.*\//, ''); // tolerate /zones/forecast/MTZ066 style
        if (!warnzone && /^[A-Z]{2}Z\d{3}$/.test(z)) warnzone = z;
        if (!warncounty && /^[A-Z]{2}C\d{3}$/.test(z)) warncounty = z;
        if (warnzone && warncounty) break;
    }
    return { warnzone, warncounty };
}

function coordsFromDoc(doc: {
    lat?: number | null;
    lng?: number | null;
    properties?: Record<string, unknown>;
}): { lat: number; lng: number } | null {
    if (
        doc.lat != null &&
        doc.lng != null &&
        Number.isFinite(Number(doc.lat)) &&
        Number.isFinite(Number(doc.lng))
    ) {
        return { lat: Number(doc.lat), lng: Number(doc.lng) };
    }
    return null;
}

/** Parse lat/lng encoded in FIRMS external ids: firms:48.1234:-114.1234:20260806…. */
function coordsFromFirmsExternalId(externalId: string): { lat: number; lng: number } | null {
    const raw = stripSourcePrefixes(externalId, 'firms', 'nasa_firms');
    const parts = raw.split(':');
    if (parts.length < 2) return null;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

/**
 * Consumer-facing NWS page (HTML UI), never api.weather.gov JSON.
 * Prefers location-specific forecast / hazard pages when coords or UGC zones exist.
 */
export function resolveNwsAlertSourceUrl(
    alertId: string,
    context?: NwsSourceContext | null,
): string {
    const id = alertId.trim();

    if (id && isHttpUrl(id) && isConsumerFriendlyNwsUrl(id)) {
        return id;
    }

    // Misrouted NWPS gauge LIDs must never open an NWS page.
    if (id && looksLikeNwpsGaugeLid(stripSourcePrefixes(id, 'nws'))) {
        return resolveNwpsSourceUrl(id);
    }

    const coords = normalizeNwsCoords(context);
    const { warnzone, warncounty } = pickNwsZoneParams(context?.zones);
    const product = String(context?.event ?? '').trim();

    // Closest thing to a per-alert UI after alerts.weather.gov was decommissioned.
    if (coords && (warnzone || warncounty || product)) {
        const params = new URLSearchParams();
        if (warnzone) params.set('warnzone', warnzone);
        if (warncounty) params.set('warncounty', warncounty);
        if (product) params.set('product1', product);
        params.set('lat', coords.lat.toFixed(4));
        params.set('lon', coords.lon.toFixed(4));
        if (context?.areaDesc?.trim()) {
            params.set('local_place1', context.areaDesc.trim().slice(0, 80));
        }
        return `${FORECAST_SHOWSIGWX}?${params.toString()}`;
    }

    if (coords) {
        const params = new URLSearchParams({
            lat: coords.lat.toFixed(4),
            lon: coords.lon.toFixed(4),
        });
        return `${FORECAST_MAPCLICK}?${params.toString()}`;
    }

    // Official human-readable alerts map (NWS recommends radar.weather.gov / weather.gov).
    return RADAR_WEATHER_GOV;
}

/**
 * NWPS river-gauge pages live on water.noaa.gov — not api.weather.gov/alerts.
 * External ids look like `nwps:gauge:CFMM8` or `nwps:CFMM8`.
 */
export function resolveNwpsSourceUrl(externalId: string): string {
    const raw = stripSourcePrefixes(externalId, 'nwps', 'gauge');
    if (!raw) return NWPS_HOME;
    if (isHttpUrl(raw)) return raw;

    if (/^[A-Za-z0-9]{3,8}$/i.test(raw)) {
        return `${NWPS_GAUGE_BASE}/${raw.toLowerCase()}`;
    }

    return NWPS_HOME;
}

/** USGS earthquake event pages. */
export function resolveUsgsEarthquakeSourceUrl(
    eventId: string,
    explicitUrl?: string,
): string | undefined {
    const url = explicitUrl?.trim();
    if (url && isHttpUrl(url)) return url;

    const id = stripSourcePrefixes(eventId, 'earthquake', 'eq', 'usgs');
    if (!id) return undefined;

    // Hydrology site numbers must not open the earthquake eventpage (404).
    if (looksLikeUsgsSiteNumber(id)) {
        return resolveUsgsWaterSiteUrl(id);
    }

    return `${USGS_EQ_BASE}/${encodeURIComponent(id)}`;
}

/** USGS NWIS / water monitoring locations. */
export function resolveUsgsWaterSiteUrl(externalId: string): string {
    const raw = stripSourcePrefixes(externalId, 'usgs', 'noaa_nwis');
    if (!raw) return USGS_WATER_HOME;
    if (isHttpUrl(raw)) return raw;

    const site = raw.replace(/^USGS-/i, '').trim();
    if (!site) return USGS_WATER_HOME;

    // Prefer modern monitoring-location pages.
    const monitoringId = /^\d+$/.test(site) ? `USGS-${site}` : site.startsWith('USGS-') ? site : `USGS-${site}`;
    return `${USGS_WATER_BASE}/${encodeURIComponent(monitoringId)}/`;
}

/** NASA FIRMS hotspot map centered on the detection. */
export function resolveFirmsSourceUrl(
    externalId: string,
    coords?: { lat: number; lng: number } | null,
): string {
    const point = coords ?? coordsFromFirmsExternalId(externalId);
    if (point) {
        return `${FIRMS_MAP_BASE}/#d:24hrs;@${point.lng.toFixed(4)},${point.lat.toFixed(4)},9z`;
    }
    return FIRMS_HOME;
}

/** InciWeb incident page (full URL is usually embedded in externalId). */
export function resolveInciWebSourceUrl(externalIdOrLink: string): string {
    const raw = stripSourcePrefixes(externalIdOrLink, 'inciweb');
    if (raw && isHttpUrl(raw)) return raw;

    // Sometimes the raw id is already a bare inciweb path/slug.
    if (raw && /^https?:/i.test(raw) === false && /inciweb\.wildfire\.gov/i.test(externalIdOrLink)) {
        const match = externalIdOrLink.match(/https?:\/\/[^\s]+/i);
        if (match) return match[0];
    }

    return INCIWEB_HOME;
}

export function resolveFemaSourceUrl(externalId: string, hintText?: string): string {
    const raw = stripSourcePrefixes(externalId, 'fema');
    if (raw && isHttpUrl(raw)) return raw;

    const fromId =
        raw.match(/DR-(\d+)/i)?.[1] ??
        raw.match(/^(\d{3,5})$/)?.[1] ??
        null;
    const fromHint = hintText?.match(/DR-(\d+)/i)?.[1] ?? null;
    const disasterNum = fromId || fromHint;

    if (disasterNum) return `${FEMA_DISASTER_BASE}/${disasterNum}`;
    return FEMA_DISASTERS_HOME;
}

export function resolveUnifiedEventSourceUrl(doc: UnifiedEventDoc): string | undefined {
    const source = String(doc.source ?? '').toLowerCase();
    const externalId = String(doc.externalId ?? doc._id ?? '');
    const coords = coordsFromDoc(doc);

    if (source === 'nwps') {
        return resolveNwpsSourceUrl(externalId);
    }

    if (source === 'nws') {
        const nwsId = stripSourcePrefixes(externalId, 'nws');
        const categoryProps = Object.values(doc.properties ?? {}).find(
            (v) => v && typeof v === 'object' && ('ugcZones' in (v as object) || 'affectedCounties' in (v as object)),
        ) as { ugcZones?: string[] } | undefined;
        return resolveNwsAlertSourceUrl(nwsId || externalId, {
            lat: doc.lat,
            lng: doc.lng,
            event: doc.name,
            areaDesc: doc.location,
            zones: Array.isArray(categoryProps?.ugcZones) ? categoryProps.ugcZones : undefined,
        });
    }

    // USGS hydrology gauges (synced as source "usgs" / "noaa_nwis") — NOT earthquakes.
    if (source === 'usgs' || source === 'noaa_nwis') {
        return resolveUsgsWaterSiteUrl(externalId);
    }

    if (source === 'earthquake') {
        const eq = doc.properties?.earthquake as { usgsEventUrl?: string; usgsEventId?: string } | undefined;
        const eventId = String(eq?.usgsEventId ?? stripSourcePrefixes(externalId, 'earthquake', 'eq'));
        return resolveUsgsEarthquakeSourceUrl(eventId, eq?.usgsEventUrl);
    }

    if (source === 'nasa_firms' || source === 'firms') {
        return resolveFirmsSourceUrl(externalId, coords);
    }

    if (source === 'inciweb') {
        return resolveInciWebSourceUrl(externalId);
    }

    if (source === 'fema') {
        return resolveFemaSourceUrl(
            externalId,
            [doc.name, doc.description, doc.location].filter(Boolean).join(' '),
        );
    }

    const stripped = stripSourcePrefixes(externalId, source);
    if (isHttpUrl(stripped)) return stripped;
    if (isHttpUrl(externalId)) return externalId.trim();

    if (source.includes('weather') || source === 'noaa_ncei') {
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
        description?: string;
        title?: string;
        event?: string;
        areaDesc?: string;
        zones?: string[];
        properties?: Record<string, Record<string, unknown>>;
        lat?: number | null;
        lng?: number | null;
        lon?: number | null;
    },
): string | undefined {
    // Re-resolve known bad patterns even if a stale sourceUrl was persisted.
    const existing = alert.sourceUrl?.trim();
    if (existing && isHttpUrl(existing) && !isKnownBadSourceUrl(existing, alert)) {
        return existing;
    }

    const unifiedSource = String(alert.unifiedSource ?? '').toLowerCase();
    const legacySource = String(alert.source ?? '').toLowerCase();
    const nwsContext: NwsSourceContext = {
        lat: alert.lat,
        lng: alert.lng,
        lon: alert.lon,
        zones: alert.zones,
        event: alert.event || alert.title,
        areaDesc: alert.areaDesc,
    };

    if (unifiedSource === 'nwps') {
        return resolveNwpsSourceUrl(alert.id);
    }

    if (unifiedSource === 'nws') {
        return resolveNwsAlertSourceUrl(alert.id, nwsContext);
    }

    // weather_api legacy feed is NWS CAP, not NWPS.
    if (legacySource.includes('weather') && unifiedSource !== 'nwps') {
        return resolveNwsAlertSourceUrl(alert.id, nwsContext);
    }

    if (unifiedSource === 'usgs' || unifiedSource === 'noaa_nwis') {
        return resolveUsgsWaterSiteUrl(alert.id);
    }

    if (unifiedSource === 'earthquake' || legacySource.includes('earthquake')) {
        const eq = alert.properties?.earthquake as { usgsEventUrl?: string; usgsEventId?: string } | undefined;
        return resolveUsgsEarthquakeSourceUrl(
            eq?.usgsEventId ? String(eq.usgsEventId) : alert.id,
            eq?.usgsEventUrl ? String(eq.usgsEventUrl) : undefined,
        );
    }

    if (unifiedSource === 'nasa_firms' || unifiedSource === 'firms') {
        const coords =
            alert.lat != null && alert.lng != null
                ? { lat: Number(alert.lat), lng: Number(alert.lng) }
                : null;
        return resolveFirmsSourceUrl(alert.id, coords);
    }

    if (unifiedSource === 'inciweb') {
        return resolveInciWebSourceUrl(alert.id);
    }

    if (unifiedSource === 'fema') {
        return resolveFemaSourceUrl(
            alert.id,
            [alert.title, alert.description].filter(Boolean).join(' '),
        );
    }

    const stripped = stripSourcePrefixes(alert.id, unifiedSource);
    if (isHttpUrl(stripped) && !isApiWeatherGovUrl(stripped)) return stripped;

    return undefined;
}

/** Detect previously persisted wrong / non-consumer links. */
function isKnownBadSourceUrl(
    url: string,
    alert: { id: string; unifiedSource?: string; source?: string },
): boolean {
    const unified = String(alert.unifiedSource ?? '').toLowerCase();
    const id = String(alert.id ?? '');

    // api.weather.gov is machine JSON — never keep as a consumer "official source".
    if (isApiWeatherGovUrl(url)) {
        return true;
    }

    // USGS water site incorrectly pointed at earthquake eventpage
    if (/earthquake\.usgs\.gov\/earthquakes\/eventpage/i.test(url)) {
        if (unified === 'usgs' || unified === 'noaa_nwis' || looksLikeUsgsSiteNumber(id)) {
            return true;
        }
    }

    return false;
}
