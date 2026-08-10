import { WeatherAlert } from '@/lib/types/api-alerts';

export interface NamedCoordinates {
    lat: number;
    lon: number;
    name: string;
}

export function parseCoordinateLocation(raw: string): { lat: number; lon: number } | null {
    const value = (raw || '').trim();
    const match = value.match(/^([-+]?[0-9]*\.?[0-9]+),\s*([-+]?[0-9]*\.?[0-9]+)$/);
    if (!match) return null;

    const lat = Number.parseFloat(match[1]);
    const lon = Number.parseFloat(match[2]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    return { lat, lon };
}

export function normalizeAreaText(input: string): string {
    return (input || '')
        .toLowerCase()
        .replace(/[^a-z0-9,\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildComparableTokens(input: string): string[] {
    const normalized = normalizeAreaText(input);
    if (!normalized) return [];

    return normalized
        .split(/[\s,;-]+/)
        .map(token => token.trim())
        .filter(token => token.length >= 3 && token !== 'county' && token !== 'zone');
}

export function splitAreaDescription(areaDesc: string | undefined): string[] {
    if (!areaDesc) return [];
    return areaDesc
        .split(';')
        .map(value => value.trim())
        .filter(Boolean);
}

const GEOCODE_TIMEOUT_MS = 2_500;
const geocodeCache = new Map<string, NamedCoordinates | null>();

import { getStateCenterCoords } from '@/lib/utils/us-state-usps';

export async function geocodeLocation(location: string): Promise<NamedCoordinates | null> {
    const trimmed = (location || '').trim();
    if (!trimmed) return null;

    const parsed = parseCoordinateLocation(trimmed);
    if (parsed) {
        return { ...parsed, name: trimmed };
    }

    const cacheKey = normalizeAreaText(trimmed);
    if (cacheKey && geocodeCache.has(cacheKey)) {
        const cached = geocodeCache.get(cacheKey);
        if (cached) return cached;
    }

    const apiKey =
        process.env.GEOAPIFY_API_KEY ||
        process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ||
        '9abe9caf7f5943d189e9ef564c5cdec7';

    // 1. Primary: Geoapify REST Geocoding
    try {
        const geoUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
            trimmed
        )}&apiKey=${apiKey}`;
        const res = await fetch(geoUrl, { next: { revalidate: 86400 } });
        if (res.ok) {
            const data = await res.json();
            const props = data.features?.[0]?.properties;
            if (props?.lat && props?.lon) {
                const resolved: NamedCoordinates = {
                    lat: Number(props.lat),
                    lon: Number(props.lon),
                    name: trimmed,
                };
                if (cacheKey) geocodeCache.set(cacheKey, resolved);
                return resolved;
            }
        }
    } catch (err) {
        console.error(`Geoapify geocodeLocation failed for "${trimmed}":`, err);
    }

    // 2. Secondary: Nominatim OpenStreetMap
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
        const response = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'EmergencyDashboard/1.0 (info@servetechglobal.com)' },
            next: { revalidate: 60 * 60 },
            signal: controller.signal,
        });

        if (response.ok) {
            const data = await response.json();
            const result = Array.isArray(data) ? data[0] : undefined;
            if (result && result.lat != null && result.lon != null) {
                const resolved: NamedCoordinates = {
                    lat: Number(result.lat),
                    lon: Number(result.lon),
                    name: trimmed,
                };
                if (cacheKey) geocodeCache.set(cacheKey, resolved);
                return resolved;
            }
        }
    } catch {
        // Fallback to state center
    } finally {
        clearTimeout(timer);
    }

    // 3. Fallback: US State Center coordinates
    const stateCenter = getStateCenterCoords(trimmed);
    if (stateCenter) {
        const resolved: NamedCoordinates = {
            lat: stateCenter.lat,
            lon: stateCenter.lng,
            name: trimmed,
        };
        if (cacheKey) geocodeCache.set(cacheKey, resolved);
        return resolved;
    }

    if (cacheKey) geocodeCache.set(cacheKey, null);
    return null;
}

export function locationMatchesAlertAreas(

    locationName: string,
    affectedAreas: string[] = [],
    areaDesc?: string,
    zones: string[] = []
): boolean {
    const normalizedLocation = normalizeAreaText(locationName);
    if (!normalizedLocation) return false;

    const locationTokens = buildComparableTokens(locationName);
    const allAreas = new Set<string>([
        ...affectedAreas.map(area => normalizeAreaText(area)),
        ...splitAreaDescription(areaDesc).map(area => normalizeAreaText(area)),
        ...zones.map(zone => normalizeAreaText(zone)),
    ]);

    if (allAreas.size === 0) return false;

    for (const area of allAreas) {
        if (!area) continue;
        if (area.includes(normalizedLocation) || normalizedLocation.includes(area)) {
            return true;
        }

        const areaTokens = buildComparableTokens(area);
        if (areaTokens.length === 0 || locationTokens.length === 0) continue;

        const commonTokens = locationTokens.filter(token => areaTokens.includes(token));
        if (commonTokens.length >= 2) {
            return true;
        }
    }

    return false;
}

export function isActionableWeatherAlert(alert: WeatherAlert): boolean {
    if (!alert.id || alert.id.startsWith('mock-weather-') || alert.id.startsWith('weather-')) {
        return false;
    }
    return true;
}

