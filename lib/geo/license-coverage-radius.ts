import { calculateDistance } from '@/lib/services/mock-map-service';

export type LatLngPoint = { lat: number; lng: number };

export type GeoBounds = {
    northeast: LatLngPoint;
    southwest: LatLngPoint;
};

export const LICENSE_COVERAGE_MIN_MILE = 5;
export const LICENSE_COVERAGE_STEP_MILE = 5;

type GeocodeGeometry = {
    location?: { lat: number; lng: number };
    viewport?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
    };
    bounds?: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
    };
};

function roundRadiusMiles(miles: number): number {
    const rounded = Math.ceil(miles / LICENSE_COVERAGE_STEP_MILE) * LICENSE_COVERAGE_STEP_MILE;
    return Math.max(rounded, LICENSE_COVERAGE_MIN_MILE);
}

export function boundsFromGeocodeGeometry(geometry?: GeocodeGeometry | null): GeoBounds | null {
    const box = geometry?.bounds ?? geometry?.viewport;
    if (!box) return null;
    return {
        northeast: { lat: box.northeast.lat, lng: box.northeast.lng },
        southwest: { lat: box.southwest.lat, lng: box.southwest.lng },
    };
}

export function boundsCenter(bounds: GeoBounds): LatLngPoint {
    const { northeast: ne, southwest: sw } = bounds;
    return {
        lat: (ne.lat + sw.lat) / 2,
        lng: (ne.lng + sw.lng) / 2,
    };
}

/**
 * Approximate bounding-circle radius for a region: center of the state's bounding box
 * to the farthest corner (Haversine), per Google Geocoding bounds/viewport.
 */
export function maxRadiusMilesFromStateBounds(bounds: GeoBounds): number {
    const center = boundsCenter(bounds);
    const { northeast: ne, southwest: sw } = bounds;
    const corners: LatLngPoint[] = [
        { lat: ne.lat, lng: ne.lng },
        { lat: ne.lat, lng: sw.lng },
        { lat: sw.lat, lng: ne.lng },
        { lat: sw.lat, lng: sw.lng },
    ];

    const maxDist = Math.max(
        ...corners.map((c) => calculateDistance(center.lat, center.lng, c.lat, c.lng))
    );

    return roundRadiusMiles(maxDist);
}

export type StateRegionQuery = {
    stateCode?: string;
    countryCode?: string;
    stateName?: string;
    countryName?: string;
};

export function buildStateGeocodeUrl(query: StateRegionQuery, apiKey: string): string | null {
    if (!apiKey) return null;
    if (!query.stateCode && !query.stateName) return null;

    if (query.stateCode && query.countryCode) {
        return (
            `https://maps.googleapis.com/maps/api/geocode/json?components=` +
            `administrative_area:${encodeURIComponent(query.stateCode)}` +
            `|country:${encodeURIComponent(query.countryCode)}` +
            `&key=${encodeURIComponent(apiKey)}`
        );
    }

    const address = query.countryName
        ? `${query.stateName}, ${query.countryName}`
        : (query.stateName ?? '');
    return (
        `https://maps.googleapis.com/maps/api/geocode/json?address=` +
        `${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`
    );
}

export async function geocodeStateBounds(
    query: StateRegionQuery,
    apiKey?: string
): Promise<GeoBounds | null> {
    const geoapifyKey =
        process.env.GEOAPIFY_API_KEY ||
        process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ||
        apiKey ||
        '9abe9caf7f5943d189e9ef564c5cdec7';

    const state = query.stateName || query.stateCode || '';
    const country = query.countryName || query.countryCode || 'USA';

    if (!state) return null;

    try {
        const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
            `${state}, ${country}`
        )}&apiKey=${geoapifyKey}`;

        const res = await fetch(url, { next: { revalidate: 86400 } });
        if (res.ok) {
            const data = await res.json();
            const feature = data.features?.[0];
            if (feature?.bbox) {
                const [minLon, minLat, maxLon, maxLat] = feature.bbox;
                return {
                    southwest: { lat: minLat, lng: minLon },
                    northeast: { lat: maxLat, lng: maxLon },
                };
            }
        }
    } catch (err) {
        console.error('Geoapify state bounds fetch error:', err);
    }

    // Default fallback state bounds box
    return {
        southwest: { lat: 34.0, lng: -120.0 },
        northeast: { lat: 42.0, lng: -114.0 },
    };
}

export async function resolveMaxRadiusForState(
    query: StateRegionQuery,
    apiKey?: string
): Promise<number | null> {
    if (!query.stateCode && !query.stateName) return 300;
    const bounds = await geocodeStateBounds(query, apiKey);
    if (!bounds) return 300;
    return maxRadiusMilesFromStateBounds(bounds);
}


export function parseRegionCodesFromGeocodeResult(result: {
    address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}): { stateCode: string; countryCode: string; stateName: string; countryName: string } {
    let stateCode = '';
    let countryCode = '';
    let stateName = '';
    let countryName = '';

    result.address_components?.forEach((c) => {
        if (c.types.includes('administrative_area_level_1')) {
            stateName = c.long_name;
            stateCode = c.short_name;
        }
        if (c.types.includes('country')) {
            countryName = c.long_name;
            countryCode = c.short_name;
        }
    });

    return { stateCode, countryCode, stateName, countryName };
}

export function centerFromGeocodeGeometry(
    geometry?: GeocodeGeometry | null
): LatLngPoint | null {
    const loc = geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
}

export function clampLicenseRadiusMile(radiusMile: number, maxRadiusMile: number): number {
    return Math.min(
        Math.max(radiusMile, LICENSE_COVERAGE_MIN_MILE),
        maxRadiusMile
    );
}

export function midpointRadiusLabel(min: number, max: number): number {
    return Math.round((min + max) / 2 / LICENSE_COVERAGE_STEP_MILE) * LICENSE_COVERAGE_STEP_MILE;
}

export function mapZoomForRadiusMiles(miles: number): number {
    if (miles <= 10) return 11;
    if (miles <= 25) return 10;
    if (miles <= 50) return 9;
    if (miles <= 100) return 8;
    if (miles <= 200) return 7;
    if (miles <= 350) return 6;
    return 5;
}

/** Axis-aligned bounding box for a geodesic circle (map fitBounds / restriction). */
export function coverageCircleLatLngBounds(
    center: LatLngPoint,
    radiusMeters: number,
): GeoBounds {
    const latDelta = radiusMeters / 111_320;
    const lngDelta =
        radiusMeters /
        (111_320 * Math.max(0.2, Math.abs(Math.cos((center.lat * Math.PI) / 180))));
    return {
        northeast: { lat: center.lat + latDelta, lng: center.lng + lngDelta },
        southwest: { lat: center.lat - latDelta, lng: center.lng - lngDelta },
    };
}

export function pointInCoverageCircle(
    lat: number,
    lng: number,
    center: LatLngPoint,
    radiusMeters: number,
): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    const radiusMile = radiusMeters / 1609.34;
    return calculateDistance(lat, lng, center.lat, center.lng) <= radiusMile;
}

/** Approximate circle ring for map polygon holes (counter-clockwise when outer is clockwise). */
export function coverageCirclePath(
    center: LatLngPoint,
    radiusMeters: number,
    points = 72,
): LatLngPoint[] {
    const latDelta = radiusMeters / 111_320;
    const lngDelta =
        radiusMeters /
        (111_320 * Math.max(0.2, Math.abs(Math.cos((center.lat * Math.PI) / 180))));
    const path: LatLngPoint[] = [];
    for (let i = 0; i <= points; i++) {
        const theta = (i / points) * 2 * Math.PI;
        path.push({
            lat: center.lat + latDelta * Math.sin(theta),
            lng: center.lng + lngDelta * Math.cos(theta),
        });
    }
    return path;
}
