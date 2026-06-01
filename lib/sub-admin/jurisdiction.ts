import License from '@/models/License';
import User from '@/models/User';
import { getUsStateBbox } from '@/lib/constants/us-state-bounding-boxes';
import { calculateDistance } from '@/lib/services/mock-map-service';
import { geocodeLocation } from '@/lib/services/location-matching';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { parseLocations } from '@/lib/utils/alert-communication-hydrate';

export type SubAdminJurisdiction = {
    stateRaw: string;
    stateCode: string | null;
    center: { lat: number; lng: number };
    radiusMile: number;
    radiusKm: number;
};

const DEFAULT_RADIUS_MILE = 5;
const MILE_TO_KM = 1.60934;
const JURISDICTION_CACHE_TTL_MS = 10 * 60 * 1000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_GEOCODE_PER_FILTER = 48;

const jurisdictionCache = new Map<
    string,
    { data: SubAdminJurisdiction | null; expiresAt: number }
>();

const geocodeCache = new Map<
    string,
    { coords: { lat: number; lng: number } | null; expiresAt: number }
>();

async function resolveSubAdminJurisdictionUncached(
    userId: string
): Promise<SubAdminJurisdiction | null> {
    const u = await User.findById(userId)
        .select('role state country city licenseId')
        .lean();
    if (!u || String(u.role) !== 'sub-admin') return null;

    const stateRaw = typeof u.state === 'string' ? u.state.trim() : '';
    if (!stateRaw) return null;

    const stateCode = normalizeStateToUsps(stateRaw);
    const license = u.licenseId
        ? await License.findById(u.licenseId).select('radiusMile billingAddress').lean()
        : null;

    const radiusMile =
        typeof license?.radiusMile === 'number' && license.radiusMile > 0
            ? license.radiusMile
            : DEFAULT_RADIUS_MILE;

    let center: { lat: number; lng: number } | null = null;
    const billingAddress =
        typeof license?.billingAddress === 'string' ? license.billingAddress.trim() : '';

    if (billingAddress) {
        const geo = await geocodeLocation(billingAddress);
        if (geo) center = { lat: geo.lat, lng: geo.lon };
    }

    if (!center) {
        const geo = await geocodeLocation(
            [u.city, stateRaw, u.country || 'USA'].filter(Boolean).join(', ')
        );
        if (geo) center = { lat: geo.lat, lng: geo.lon };
    }

    if (!center && stateCode) {
        const bbox = getUsStateBbox(stateCode);
        if (bbox) {
            const [west, south, east, north] = bbox;
            center = { lat: (south + north) / 2, lng: (west + east) / 2 };
        }
    }

    if (!center) return null;

    return {
        stateRaw,
        stateCode,
        center,
        radiusMile,
        radiusKm: radiusMile * MILE_TO_KM,
    };
}

export async function resolveSubAdminJurisdiction(
    userId: string
): Promise<SubAdminJurisdiction | null> {
    const cached = jurisdictionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    const data = await resolveSubAdminJurisdictionUncached(userId);
    jurisdictionCache.set(userId, {
        data,
        expiresAt: Date.now() + JURISDICTION_CACHE_TTL_MS,
    });
    return data;
}

export function invalidateSubAdminJurisdictionCache(userId?: string): void {
    if (userId) jurisdictionCache.delete(userId);
    else jurisdictionCache.clear();
}

/** Bounding box around license center + radius (for DB pre-filter). */
export function jurisdictionLatLngBBox(jurisdiction: SubAdminJurisdiction): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
} {
    const latDelta = jurisdiction.radiusMile / 69;
    const cosLat = Math.cos((jurisdiction.center.lat * Math.PI) / 180);
    const lngDelta = jurisdiction.radiusMile / (69 * Math.max(0.2, Math.abs(cosLat)));
    return {
        minLat: jurisdiction.center.lat - latDelta,
        maxLat: jurisdiction.center.lat + latDelta,
        minLng: jurisdiction.center.lng - lngDelta,
        maxLng: jurisdiction.center.lng + lngDelta,
    };
}

/** True when coordinates fall within the license radius from center. */
export function coordinatesInJurisdiction(
    lat: number,
    lng: number,
    jurisdiction: SubAdminJurisdiction
): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const distMile = calculateDistance(
        lat,
        lng,
        jurisdiction.center.lat,
        jurisdiction.center.lng
    );
    return distMile <= jurisdiction.radiusMile;
}

function parseLatLonPairFromLocation(loc: string): { lat: number; lng: number } | null {
    const s = loc.trim();
    let m = s.match(/Hotspot near\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/i);
    if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    m = s.match(/·\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/i);
    if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
}

export function extractAlertRowCoordinates(row: {
    lat?: number | null;
    lng?: number | null;
    location?: string;
}): { lat: number; lng: number } | null {
    if (typeof row.lat === 'number' && typeof row.lng === 'number') {
        return { lat: row.lat, lng: row.lng };
    }
    const loc = typeof row.location === 'string' ? row.location : '';
    return parseLatLonPairFromLocation(loc);
}

export type AlertRowForJurisdiction = {
    source?: string;
    location?: string;
    locations?: string[];
    description?: string;
    name?: string;
    instructions?: string[];
    lat?: number | null;
    lng?: number | null;
};

function locationQueriesFromRow(row: AlertRowForJurisdiction): string[] {
    const parts: string[] = [];
    if (Array.isArray(row.locations)) {
        parts.push(...row.locations.map(String));
    }
    if (typeof row.location === 'string' && row.location.trim()) {
        parts.push(...parseLocations(row.location));
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of parts) {
        const s = raw.trim();
        if (!s || /^\(\+\d+\)$/i.test(s)) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
    }
    return out;
}

async function geocodeLocationCached(
    query: string,
    geocodeBudget?: { remaining: number }
): Promise<{ lat: number; lng: number } | null> {
    const key = query.trim().toLowerCase();
    if (!key) return null;

    const cached = geocodeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.coords;
    }

    if (geocodeBudget && geocodeBudget.remaining <= 0) {
        return null;
    }
    if (geocodeBudget) {
        geocodeBudget.remaining -= 1;
    }

    const geo = await geocodeLocation(query);
    const coords = geo ? { lat: geo.lat, lng: geo.lon } : null;
    geocodeCache.set(key, { coords, expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS });
    return coords;
}

/** Strict radius check when coordinates are already known. */
export function alertRowMatchesSubAdminJurisdictionSync(
    row: AlertRowForJurisdiction,
    jurisdiction: SubAdminJurisdiction
): boolean {
    const coords = extractAlertRowCoordinates(row);
    if (!coords) return false;
    return coordinatesInJurisdiction(coords.lat, coords.lng, jurisdiction);
}

/**
 * Radius-only match. Geocodes location text when lat/lng are missing or outside radius (cached).
 * An alert is included only if at least one location point falls inside the license radius.
 */
export async function alertRowMatchesSubAdminJurisdiction(
    row: AlertRowForJurisdiction,
    jurisdiction: SubAdminJurisdiction,
    geocodeBudget?: { remaining: number }
): Promise<boolean> {
    const coords = extractAlertRowCoordinates(row);
    if (coords && coordinatesInJurisdiction(coords.lat, coords.lng, jurisdiction)) {
        return true;
    }

    const queries = locationQueriesFromRow(row);
    for (const query of queries) {
        const geo = await geocodeLocationCached(query, geocodeBudget);
        if (geo && coordinatesInJurisdiction(geo.lat, geo.lng, jurisdiction)) {
            return true;
        }
    }
    return false;
}

export async function filterUnifiedEventDocsForJurisdiction<
    T extends AlertRowForJurisdiction,
>(docs: T[], jurisdiction: SubAdminJurisdiction): Promise<T[]> {
    const out: T[] = [];
    const geocodeBudget = { remaining: MAX_GEOCODE_PER_FILTER };

    for (const doc of docs) {
        if (await alertRowMatchesSubAdminJurisdiction(doc, jurisdiction, geocodeBudget)) {
            out.push(doc);
        }
    }
    return out;
}

export async function filterHydratedForSubAdminJurisdiction(
    hydrated: Record<string, unknown>[],
    jurisdiction: SubAdminJurisdiction
): Promise<Record<string, unknown>[]> {
    const rows: AlertRowForJurisdiction[] = hydrated.map((raw) => ({
        source: typeof raw.source === 'string' ? raw.source : '',
        location: typeof raw.location === 'string' ? raw.location : '',
        locations: raw.locations as string[] | undefined,
        description: typeof raw.description === 'string' ? raw.description : '',
        name: typeof raw.name === 'string' ? raw.name : '',
        instructions: Array.isArray(raw.instructions)
            ? (raw.instructions as string[])
            : undefined,
        lat: typeof raw.lat === 'number' ? raw.lat : null,
        lng: typeof raw.lng === 'number' ? raw.lng : null,
    }));

    const geocodeBudget = { remaining: MAX_GEOCODE_PER_FILTER };
    const out: Record<string, unknown>[] = [];

    for (let i = 0; i < hydrated.length; i++) {
        if (await alertRowMatchesSubAdminJurisdiction(rows[i], jurisdiction, geocodeBudget)) {
            out.push(hydrated[i]);
        }
    }
    return out;
}
