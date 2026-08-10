import User from '@/models/User';
import Responder from '@/models/Responder';
import { geocodeLocation } from '@/lib/services/location-matching';
import { getStateCenterCoords, normalizeStateToUsps } from '@/lib/utils/us-state-usps';

import {
    coordinatesInJurisdiction,
    jurisdictionLatLngBBox,
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';

export type GisMapMarkerDto = {
    id: string;
    lat: number;
    lng: number;
    title: string;
    type: 'user' | 'incident';
    isSafe?: boolean;
    status?: string;
    location?: string;
    description?: string;
    color?: string;
    icon?: string;
};

const CITIZEN_ROLES = ['user'] as const;

function buildScopedCitizenQuery(
    subAdminUserId: string,
    jurisdiction: SubAdminJurisdiction,
    licenseId: unknown,
    stateRaw: string,
): Record<string, unknown> {
    const scopeOr: Record<string, unknown>[] = [{ createdBy: subAdminUserId }];
    if (licenseId) scopeOr.push({ licenseId });

    if (stateRaw) {
        const escaped = stateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        scopeOr.push({ state: new RegExp(escaped, 'i') });
        const usps = normalizeStateToUsps(stateRaw);
        if (usps) scopeOr.push({ state: new RegExp(usps, 'i') });
    }

    const base: Record<string, unknown> = {
        role: { $in: [...CITIZEN_ROLES] },
        accountStatus: 'approved',
        $or: scopeOr,
    };

    if (jurisdiction.coverageType === 'radius') {
        const bbox = jurisdictionLatLngBBox(jurisdiction);
        return {
            $and: [
                base,
                {
                    $or: [
                        {
                            lat: { $gte: bbox.minLat, $lte: bbox.maxLat },
                            lng: { $gte: bbox.minLng, $lte: bbox.maxLng },
                        },
                        { lat: { $exists: false } },
                        { lng: { $exists: false } },
                        { lat: null },
                        { lng: null },
                    ],
                },
            ],
        };
    }

    return base;
}

export async function fetchScopedCitizenMarkers(
    subAdminUserId: string,
    opts?: { allowGeocode?: boolean }
): Promise<GisMapMarkerDto[]> {
    const jurisdiction = await resolveSubAdminJurisdiction(subAdminUserId);
    if (!jurisdiction) return [];

    const subAdmin: any = await User.findById(subAdminUserId).select('state licenseId').lean();
    if (!subAdmin) return [];

    const stateRaw = typeof subAdmin.state === 'string' ? subAdmin.state.trim() : '';
    const licenseId = subAdmin.licenseId;

    const allowGeocode = opts?.allowGeocode === true;

    const query = buildScopedCitizenQuery(
        subAdminUserId,
        jurisdiction,
        licenseId,
        stateRaw,
    );

    const users = await User.find(query)
        .select('name location city state zipcode isSafe lat lng')
        .limit(500)
        .lean();

    const geocoded = allowGeocode
        ? await geocodeUsersMissingCoords(users, citizenLocationStr, 40)
        : new Map<string, { lat: number; lng: number }>();

    const markers: GisMapMarkerDto[] = [];
    const seen = new Set<string>();

    for (const u of users) {
        const id = String(u._id);
        if (seen.has(id)) continue;

        const locationStr = citizenLocationStr(u);

        const coords =
            typeof u.lat === 'number' && typeof u.lng === 'number'
                ? { lat: u.lat, lng: u.lng }
                : geocoded.get(id) ?? null;
        if (!coords) continue;
        if (!coordinatesInJurisdiction(coords.lat, coords.lng, jurisdiction)) continue;

        seen.add(id);
        const isSafe = u.isSafe !== false;
        markers.push({
            id,
            lat: coords.lat,
            lng: coords.lng,
            title: String(u.name || 'Citizen'),
            type: 'user',
            isSafe,
            status: isSafe ? 'Safe' : 'At Risk',
            location: locationStr,
            description: isSafe
                ? `Citizen · ${locationStr || 'Unknown'}`
                : `At risk · ${locationStr || 'Unknown'}`,
        });
    }

    return markers;
}

function responderVisuals(unitType: string) {
    const t = unitType.toLowerCase();
    if (t.includes('police')) return { color: '#3B82F6', icon: 'police' };
    if (t.includes('fire')) return { color: '#EF4444', icon: 'fire' };
    return { color: '#10B981', icon: 'medical' };
}

async function resolveCoords(
    lat?: number | null,
    lng?: number | null,
    location?: string | null,
    fallbackQuery?: string
): Promise<{ lat: number; lng: number } | null> {
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
    }
    const query = (location || fallbackQuery || '').trim();
    if (!query) return null;
    const geo = await geocodeLocation(query);
    if (!geo) return null;
    return { lat: geo.lat, lng: geo.lon };
}

const GEOCODE_CONCURRENCY = 5;

/** Parallel Nominatim lookups; persist coords on User so later map loads stay fast. */
async function geocodeUsersMissingCoords<T extends { _id: unknown; lat?: number | null; lng?: number | null }>(
    users: T[],
    getQuery: (user: T) => string,
    budget: number,
): Promise<Map<string, { lat: number; lng: number }>> {
    const resolved = new Map<string, { lat: number; lng: number }>();
    if (budget <= 0) return resolved;

    const pending: { id: string; query: string }[] = [];
    for (const user of users) {
        if (pending.length >= budget) break;
        if (typeof user.lat === 'number' && typeof user.lng === 'number') continue;
        const query = getQuery(user).trim();
        if (!query) continue;
        pending.push({ id: String(user._id), query });
    }

    for (let i = 0; i < pending.length; i += GEOCODE_CONCURRENCY) {
        const batch = pending.slice(i, i + GEOCODE_CONCURRENCY);
        await Promise.all(
            batch.map(async ({ id, query }) => {
                const coords = await resolveCoords(null, null, query);
                if (!coords) return;
                resolved.set(id, coords);
                void User.updateOne(
                    { _id: id },
                    { $set: { lat: coords.lat, lng: coords.lng } },
                ).catch(() => undefined);
            }),
        );
    }

    return resolved;
}

export async function fetchScopedResponderMarkers(
    subAdminUserId: string,
    opts?: { allowGeocode?: boolean }
): Promise<GisMapMarkerDto[]> {
    const jurisdiction = await resolveSubAdminJurisdiction(subAdminUserId);
    const subAdmin: any = await User.findById(subAdminUserId)
        .select('state city licenseId')
        .lean();
    if (!subAdmin) return [];


    const stateRaw = typeof subAdmin.state === 'string' ? subAdmin.state.trim() : '';
    const stateCode = normalizeStateToUsps(stateRaw);
    const licenseId = subAdmin.licenseId;
    const allowGeocode = opts?.allowGeocode === true;

    const andParts: Record<string, unknown>[] = [{ role: 'responder' }];
    const scopeOr: Record<string, unknown>[] = [];
    if (licenseId) scopeOr.push({ licenseId });
    if (stateRaw) {
        scopeOr.push({
            state: new RegExp(stateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        });
    }
    if (scopeOr.length > 0) andParts.push({ $or: scopeOr });

    const responderUsers = await User.find({ $and: andParts })
        .select('name location city state lat lng responderVertical responderFunction')
        .limit(100)
        .lean();

    const legacyQuery: Record<string, unknown> = {};
    if (stateRaw) {
        const escaped = stateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const orLegacy: Record<string, unknown>[] = [
            { location: { $regex: escaped, $options: 'i' } },
            { city: { $regex: escaped, $options: 'i' } },
        ];
        if (stateCode) {
            orLegacy.push({ location: { $regex: stateCode, $options: 'i' } });
        }
        legacyQuery.$or = orLegacy;
    }

    const legacyResponders = stateRaw
        ? await Responder.find(legacyQuery).limit(100).lean()
        : [];

    const markers: GisMapMarkerDto[] = [];
    const seen = new Set<string>();
    let geocodeBudget = allowGeocode ? 30 : 0;

    const pushMarker = async (
        id: string,
        name: string,
        unitType: string,
        status: string,
        location: string,
        coords?: { lat?: number; lng?: number } | null,
        jurisdictionScope?: SubAdminJurisdiction | null
    ) => {
        if (seen.has(id)) return;
        let pos: { lat: number; lng: number } | null = null;
        if (coords?.lat != null && coords?.lng != null) {
            pos = { lat: coords.lat, lng: coords.lng };
        } else if (geocodeBudget > 0) {
            pos = await resolveCoords(null, null, location);
            if (pos) geocodeBudget -= 1;
        }
        if (!pos) return;
        if (
            jurisdictionScope &&
            !coordinatesInJurisdiction(pos.lat, pos.lng, jurisdictionScope)
        ) {
            return;
        }
        seen.add(id);
        const visuals = responderVisuals(unitType);
        markers.push({
            id,
            lat: pos.lat,
            lng: pos.lng,
            title: name,
            type: 'incident',
            status,
            location,
            description: `${unitType} · ${location}`,
            color: visuals.color,
            icon: visuals.icon,
        });
    };

    for (const u of responderUsers) {
        const unitType =
            String(u.responderVertical || u.responderFunction || 'Responder').replace(/_/g, ' ');
        const locationStr =
            (typeof u.location === 'string' && u.location.trim()) ||
            [u.city, u.state].filter(Boolean).join(', ');
        await pushMarker(
            String(u._id),
            String(u.name || 'Responder'),
            unitType,
            'Active',
            locationStr,
            typeof u.lat === 'number' && typeof u.lng === 'number'
                ? { lat: u.lat, lng: u.lng }
                : null,
            jurisdiction,
        );
    }

    for (const r of legacyResponders) {
        const locationStr =
            (typeof r.location === 'string' && r.location) ||
            [r.city].filter(Boolean).join(', ');
        await pushMarker(
            `legacy-${String(r._id)}`,
            String(r.name || 'Responder'),
            String(r.type || 'Unit'),
            String(r.status || 'Active'),
            locationStr,
            r.coordinates as { lat?: number; lng?: number } | undefined,
            jurisdiction
        );
    }

    return markers;
}

export function gisMarkerDtoToClientMarker(dto: GisMapMarkerDto) {
    return {
        id: dto.id,
        position: { lat: dto.lat, lng: dto.lng },
        title: dto.title,
        type: dto.type,
        isSafe: dto.isSafe,
        status: dto.status,
        location: dto.location,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
    };
}

function stateRegex(stateRaw: string): RegExp {
    return new RegExp(stateRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function userMatchesStateFilter(
    user: any,
    stateRaw?: string
): boolean {
    if (!stateRaw?.trim()) return true;
    const st = String(user?.state ?? '').trim();
    if (!st) return false;
    const usps = normalizeStateToUsps(stateRaw);
    const userUsps = normalizeStateToUsps(st);
    if (usps && userUsps) return usps === userUsps;
    return stateRegex(stateRaw).test(st);
}

function citizenLocationStr(u: any): string {
    return (
        (typeof u?.location === 'string' && u.location.trim()) ||
        [u?.city, u?.state, u?.zipcode].filter(Boolean).join(', ')
    );
}


/** Super-admin: approved citizens from `User` (not legacy seed collections). */
export async function fetchNationwideCitizenMarkers(opts?: {
    stateRaw?: string;
    allowGeocode?: boolean;
}): Promise<GisMapMarkerDto[]> {
    const users = await User.find({
        role: { $in: [...CITIZEN_ROLES] },
        accountStatus: 'approved',
    })
        .select('name location city state zipcode isSafe lat lng')
        .limit(500)
        .lean();

    const filtered = users.filter((u) => userMatchesStateFilter(u, opts?.stateRaw));
    const geocoded = opts?.allowGeocode
        ? await geocodeUsersMissingCoords(filtered, citizenLocationStr, 40)
        : new Map<string, { lat: number; lng: number }>();

    const markers: GisMapMarkerDto[] = [];
    for (const u of filtered) {
        const id = String(u._id);
        const locationStr = citizenLocationStr(u);
        const coords =
            typeof u.lat === 'number' && typeof u.lng === 'number'
                ? { lat: u.lat, lng: u.lng }
                : geocoded.get(id) ?? null;
        if (!coords) continue;

        const isSafe = u.isSafe !== false;
        markers.push({
            id,
            lat: coords.lat,
            lng: coords.lng,
            title: String(u.name || 'Citizen'),
            type: 'user',
            isSafe,
            status: isSafe ? 'Safe' : 'At Risk',
            location: locationStr,
            description: isSafe
                ? `Citizen · ${locationStr || 'Unknown'}`
                : `At risk · ${locationStr || 'Unknown'}`,
        });
    }

    return markers;
}

/** Super-admin: responder accounts from `User` (not legacy `Responder` seed rows). */
export async function fetchNationwideResponderMarkers(opts?: {
    stateRaw?: string;
    allowGeocode?: boolean;
}): Promise<GisMapMarkerDto[]> {
    const responderUsers = await User.find({ role: 'responder' })
        .select('name location city state lat lng responderVertical responderFunction')
        .limit(300)
        .lean();

    const filtered = responderUsers.filter((u) => userMatchesStateFilter(u, opts?.stateRaw));
    const locationOf = (u: (typeof filtered)[number]) =>
        (typeof u.location === 'string' && u.location.trim()) ||
        [u.city, u.state].filter(Boolean).join(', ');
    const geocoded = opts?.allowGeocode
        ? await geocodeUsersMissingCoords(filtered, locationOf, 30)
        : new Map<string, { lat: number; lng: number }>();

    const markers: GisMapMarkerDto[] = [];
    for (const u of filtered) {
        const id = String(u._id);
        const unitType =
            String(u.responderVertical || u.responderFunction || 'Responder').replace(/_/g, ' ');
        const locationStr = locationOf(u);
        const coords =
            typeof u.lat === 'number' && typeof u.lng === 'number'
                ? { lat: u.lat, lng: u.lng }
                : geocoded.get(id) ?? null;
        if (!coords) continue;

        const visuals = responderVisuals(unitType);
        markers.push({
            id,
            lat: coords.lat,
            lng: coords.lng,
            title: String(u.name || 'Responder'),
            type: 'incident',
            status: 'Active',
            location: locationStr,
            description: `${unitType} · ${locationStr}`,
            color: visuals.color,
            icon: visuals.icon,
        });
    }

    return markers;
}

/** Super-admin Leaders tab: sub-admin accounts with map positions. */
export async function fetchSubAdminLeaderMarkers(opts?: {
    stateRaw?: string;
    allowGeocode?: boolean;
}): Promise<GisMapMarkerDto[]> {
    const admins = await User.find({ role: 'sub-admin' })
        .select('name city state country lat lng email')
        .limit(200)
        .lean();

    const filtered = admins.filter((u) => userMatchesStateFilter(u, opts?.stateRaw));
    const locationOf = (u: (typeof filtered)[number]) =>
        [u.city, u.state, u.country || 'USA'].filter(Boolean).join(', ');
    const geocoded = opts?.allowGeocode
        ? await geocodeUsersMissingCoords(filtered, locationOf, 20)
        : new Map<string, { lat: number; lng: number }>();

    const markers: GisMapMarkerDto[] = [];
    for (const u of filtered) {
        const id = String(u._id);
        const locationStr = locationOf(u);
        let coords =
            typeof u.lat === 'number' && typeof u.lng === 'number'
                ? { lat: u.lat, lng: u.lng }
                : geocoded.get(id) ?? null;

        // Guaranteed state center fallback if lat/lng not stored yet
        if (!coords && u.state) {
            const center = getStateCenterCoords(u.state);
            if (center) {
                coords = center;
                void User.updateOne(
                    { _id: u._id },
                    { $set: { lat: center.lat, lng: center.lng } }
                ).catch(() => undefined);
            }
        }

        if (!coords) continue;

        markers.push({
            id,
            lat: coords.lat,
            lng: coords.lng,
            title: String(u.name || u.email || 'Sub-Admin'),
            type: 'user',
            status: 'Online',
            location: locationStr || u.state || 'USA',
            description: `Sub-Admin · ${locationStr || u.state || 'USA'}`,
        });
    }

    return markers;

}
