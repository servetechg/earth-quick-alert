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

export async function geocodeLocation(location: string): Promise<NamedCoordinates | null> {
    const trimmed = (location || '').trim();
    if (!trimmed) return null;

    const parsed = parseCoordinateLocation(trimmed);
    if (parsed) {
        return { ...parsed, name: trimmed };
    }

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
        const response = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': 'EmergencyDashboard/1.0 (info@servetechglobal.com)' },
            next: { revalidate: 60 * 60 },
        });

        if (!response.ok) return null;
        const data = await response.json();
        const result = Array.isArray(data) ? data[0] : undefined;
        if (!result || result.lat == null || result.lon == null) return null;

        return {
            lat: Number(result.lat),
            lon: Number(result.lon),
            name: trimmed,
        };
    } catch (error) {
        console.error(`Failed to geocode location: ${trimmed}`, error);
        return null;
    }
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

