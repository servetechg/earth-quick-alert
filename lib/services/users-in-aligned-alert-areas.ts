import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import UserProfile from '@/models/UserProfile';
import { pointInUsStateBBox } from '@/lib/constants/us-state-bounding-boxes';
import {
    geocodeLocation,
    locationMatchesAlertAreas,
    type NamedCoordinates,
} from '@/lib/services/location-matching';
import { calculateDistance } from '@/lib/services/mock-map-service';
import { buildUserZones, formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import { parseLocations } from '@/lib/utils/alert-communication-hydrate';
import { matchesStateWideUnifiedAlert, locationStringsMatchState } from '@/lib/utils/alert-location-state-match';
import {
    coordinatesInJurisdiction,
    extractAlertRowCoordinates,
    jurisdictionLatLngBBox,
    type AlertRowForJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';

const MAX_ALERT_GEOCODE = 48;
const MAX_USER_GEOCODE = 80;
/** Same proximity fallback as mobile alert zone matching (~50 mi). */
const USER_ZONE_ALERT_RADIUS_MILE = 50;

export type PopulationAtRiskUserEntry = {
    id: string;
    name: string;
    email: string;
    address: string;
};

type PreparedAlert = {
    locationText: string;
    points: { lat: number; lng: number }[];
    row: AlertRowForJurisdiction;
};

function rowFromHydrated(raw: Record<string, unknown>): AlertRowForJurisdiction {
    return {
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
    };
}

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

async function geocodeCached(
    query: string,
    cache: Map<string, NamedCoordinates | null>,
    budget: { remaining: number },
): Promise<NamedCoordinates | null> {
    const key = query.trim().toLowerCase();
    if (!key) return null;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (budget.remaining <= 0) return null;
    budget.remaining -= 1;
    const geo = await geocodeLocation(query);
    cache.set(key, geo);
    return geo;
}

async function prepareAlerts(
    rows: AlertRowForJurisdiction[],
    geocodeCache: Map<string, NamedCoordinates | null>,
    budget: { remaining: number },
    options?: { skipTextGeocode?: boolean },
): Promise<PreparedAlert[]> {
    const prepared: PreparedAlert[] = [];
    for (const row of rows) {
        const points: { lat: number; lng: number }[] = [];
        const coords = extractAlertRowCoordinates(row);
        if (coords) points.push(coords);

        if (!options?.skipTextGeocode) {
            for (const query of locationQueriesFromRow(row)) {
                if (budget.remaining <= 0) break;
                const geo = await geocodeCached(query, geocodeCache, budget);
                if (geo) points.push({ lat: geo.lat, lng: geo.lon });
            }
        }

        prepared.push({ locationText: row.location ?? '', points, row });
    }
    return prepared;
}

function zonesFromProfileDoc(doc: Record<string, unknown> | undefined) {
    if (!doc?.address) return buildUserZones(null);
    return buildUserZones({
        address: doc.address as UserProfilePayload['address'],
        alertLocations: (doc.alertLocations as UserProfilePayload['alertLocations']) ?? [],
    } as UserProfilePayload);
}

function displayName(u: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}): string {
    const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    if (full) return full;
    const n = String(u.name ?? '').trim();
    if (n) return n;
    return String(u.email ?? 'Unknown user');
}

function resolveUserAddress(
    profileDoc: Record<string, unknown> | undefined,
    u: { city?: string | null; state?: string | null; location?: string | null },
    zoneStrings: string[],
): string {
    const profileAddress = profileDoc?.address
        ? formatProfileAddress(profileDoc.address as UserProfilePayload['address'])
        : null;
    if (profileAddress) return profileAddress;
    if (zoneStrings.length > 0) return zoneStrings[0];
    const fallback = [u.location, u.city, u.state].filter(Boolean).join(', ');
    return fallback || 'Address not on file';
}

function userPlausiblyInJurisdictionState(
    u: { state?: string | null },
    profileDoc: Record<string, unknown> | undefined,
    jurisdiction: SubAdminJurisdiction,
): boolean {
    if (!jurisdiction.stateCode) return true;
    const profileState =
        profileDoc?.address && typeof (profileDoc.address as { state?: string }).state === 'string'
            ? normalizeStateToUsps(String((profileDoc.address as { state: string }).state))
            : null;
    if (profileState && profileState === jurisdiction.stateCode) return true;
    const userState = normalizeStateToUsps(String(u.state ?? ''));
    if (userState && userState === jurisdiction.stateCode) return true;
    return false;
}

function userLatLngRoughlyInJurisdictionBBox(
    lat: number | null,
    lng: number | null,
    jurisdiction: SubAdminJurisdiction,
): boolean {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return false;
    }
    if (jurisdiction.coverageType === 'state') {
        if (!jurisdiction.stateCode) return false;
        return pointInUsStateBBox(lng, lat, jurisdiction.stateCode);
    }
    const { minLat, maxLat, minLng, maxLng } = jurisdictionLatLngBBox(jurisdiction);
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

function userInSubAdminStateForAlert(
    zoneStrings: string[],
    row: AlertRowForJurisdiction,
    jurisdiction: SubAdminJurisdiction,
): boolean {
    if (!jurisdiction.stateRaw.trim()) return false;
    if (!locationStringsMatchState(zoneStrings, jurisdiction.stateRaw)) return false;
    return matchesStateWideUnifiedAlert(row, jurisdiction.stateRaw);
}

function userAffectedByPreparedAlerts(
    zoneStrings: string[],
    geocodedZones: NamedCoordinates[],
    prepared: PreparedAlert[],
    jurisdiction?: SubAdminJurisdiction | null,
): boolean {
    for (const { locationText, points, row } of prepared) {
        for (const zone of zoneStrings) {
            if (
                locationMatchesAlertAreas(zone, [locationText], locationText, []) ||
                locationMatchesAlertAreas(zone, [], locationText, [])
            ) {
                return true;
            }
        }
        for (const userCoords of geocodedZones) {
            for (const pt of points) {
                const distMile = calculateDistance(
                    userCoords.lat,
                    userCoords.lon,
                    pt.lat,
                    pt.lng,
                );
                if (distMile <= USER_ZONE_ALERT_RADIUS_MILE) return true;
            }
        }
        if (jurisdiction && userInSubAdminStateForAlert(zoneStrings, row, jurisdiction)) {
            return true;
        }
    }
    return false;
}

/**
 * List approved Ready2Go app users whose profile/home zones overlap active aligned incidents.
 * Uses the same zone + proximity rules as the mobile alerts feed.
 */
export async function listUsersInAlignedAlertAreas(
    alignedRows: Record<string, unknown>[],
    jurisdiction?: SubAdminJurisdiction | null,
): Promise<PopulationAtRiskUserEntry[]> {
    if (alignedRows.length === 0) return [];

    const rows = alignedRows.map(rowFromHydrated);
    await connectDB();

    const geocodeCache = new Map<string, NamedCoordinates | null>();
    const skipAlertTextGeocode = Boolean(jurisdiction);

    const users = await User.find({
        role: 'user',
        accountStatus: 'approved',
    })
        .select('_id name firstName lastName email lat lng state city location')
        .lean();

    if (users.length === 0) return [];

    const userIds = users.map((u) => String(u._id));
    const profileDocs = await UserProfile.find({ userId: { $in: userIds } }).lean();
    const profileByUserId = new Map(profileDocs.map((p) => [String(p.userId), p]));

    const userGeocodeBudget = { remaining: MAX_USER_GEOCODE };
    const prepared = await prepareAlerts(rows, geocodeCache, { remaining: MAX_ALERT_GEOCODE }, {
        skipTextGeocode: skipAlertTextGeocode,
    });
    const atRisk: PopulationAtRiskUserEntry[] = [];

    const candidateUsers = jurisdiction
        ? users.filter((u) => {
              const profileDoc = profileByUserId.get(String(u._id)) as
                  | Record<string, unknown>
                  | undefined;
              if (userPlausiblyInJurisdictionState(u, profileDoc, jurisdiction)) {
                  return true;
              }
              const lat0 = u.lat != null ? Number(u.lat) : null;
              const lng0 = u.lng != null ? Number(u.lng) : null;
              return userLatLngRoughlyInJurisdictionBBox(lat0, lng0, jurisdiction);
          })
        : users;

    for (const u of candidateUsers) {
        const uid = String(u._id);
        const profileDoc = profileByUserId.get(uid) as Record<string, unknown> | undefined;

        const zones = zonesFromProfileDoc(profileDoc);
        const zoneStrings = zones.map((z) => z.locationString);
        const sameStateProfile =
            jurisdiction != null &&
            userPlausiblyInJurisdictionState(u, profileDoc, jurisdiction);

        if (sameStateProfile && zoneStrings.length > 0) {
            if (userAffectedByPreparedAlerts(zoneStrings, [], prepared, jurisdiction)) {
                atRisk.push({
                    id: uid,
                    name: displayName(u),
                    email: String(u.email ?? ''),
                    address: resolveUserAddress(profileDoc, u, zoneStrings),
                });
            }
            continue;
        }

        const geocodedZones: NamedCoordinates[] = [];

        let userLat: number | null = u.lat != null ? Number(u.lat) : null;
        let userLng: number | null = u.lng != null ? Number(u.lng) : null;

        for (const zone of zones) {
            if (userGeocodeBudget.remaining <= 0) break;
            const coords = await geocodeCached(zone.locationString, geocodeCache, userGeocodeBudget);
            if (coords) geocodedZones.push(coords);
        }

        if (geocodedZones.length === 0 && (userLat == null || userLng == null)) {
            const fallbackLoc = [u.city, u.state, u.location].filter(Boolean).join(', ');
            if (fallbackLoc.trim() && userGeocodeBudget.remaining > 0) {
                const coords = await geocodeCached(fallbackLoc, geocodeCache, userGeocodeBudget);
                if (coords) {
                    geocodedZones.push(coords);
                    zoneStrings.push(fallbackLoc);
                    userLat = coords.lat;
                    userLng = coords.lon;
                }
            }
        }

        if (userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng)) {
            const hasPoint = geocodedZones.some(
                (z) => z.lat === userLat && z.lon === userLng,
            );
            if (!hasPoint) {
                geocodedZones.push({ name: 'user-coords', lat: userLat, lon: userLng });
            }
        }

        if (jurisdiction) {
            const lat = userLat ?? geocodedZones[0]?.lat;
            const lng = userLng ?? geocodedZones[0]?.lon;
            const hasCoords =
                lat != null &&
                lng != null &&
                Number.isFinite(lat) &&
                Number.isFinite(lng);
            const inLicenseRadius =
                hasCoords && coordinatesInJurisdiction(lat, lng, jurisdiction);
            if (!inLicenseRadius) {
                continue;
            }
        }

        if (zoneStrings.length === 0 && geocodedZones.length === 0) {
            continue;
        }

        if (userAffectedByPreparedAlerts(zoneStrings, geocodedZones, prepared, jurisdiction)) {
            atRisk.push({
                id: uid,
                name: displayName(u),
                email: String(u.email ?? ''),
                address: resolveUserAddress(profileDoc, u, zoneStrings),
            });
        }
    }

    return atRisk.sort((a, b) => a.name.localeCompare(b.name));
}
