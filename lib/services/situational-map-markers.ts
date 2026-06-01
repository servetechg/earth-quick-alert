import User from '@/models/User';
import Responder from '@/models/Responder';
import { getSubAdminUserFilter } from '@/lib/admin-filters';
import { geocodeLocation } from '@/lib/services/location-matching';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import {
    coordinatesInJurisdiction,
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

const CITIZEN_ROLES = ['user', 'manager', 'eoc-manager', 'admin'] as const;

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

export async function fetchScopedCitizenMarkers(subAdminUserId: string): Promise<GisMapMarkerDto[]> {
    const jurisdiction = await resolveSubAdminJurisdiction(subAdminUserId);
    const subAdmin = await User.findById(subAdminUserId).select('state city name').lean();
    if (!subAdmin) return [];

    const userFilter = await getSubAdminUserFilter(subAdminUserId);
    const baseQuery = { role: { $in: [...CITIZEN_ROLES] } };
    const query = userFilter ? { $and: [baseQuery, userFilter] } : baseQuery;

    const users = await User.find(query)
        .select('name location city state zipcode isSafe accountStatus')
        .limit(200)
        .lean();

    const markers: GisMapMarkerDto[] = [];
    let geocodeBudget = 40;

    for (const u of users) {
        const locationStr =
            (typeof u.location === 'string' && u.location.trim()) ||
            [u.city, u.state, u.zipcode].filter(Boolean).join(', ');

        let coords: { lat: number; lng: number } | null = null;
        if (geocodeBudget > 0) {
            coords = await resolveCoords(null, null, locationStr);
            if (coords) geocodeBudget -= 1;
        }
        if (!coords) continue;
        if (jurisdiction && !coordinatesInJurisdiction(coords.lat, coords.lng, jurisdiction)) {
            continue;
        }

        const isSafe = u.isSafe !== false;
        markers.push({
            id: String(u._id),
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

export async function fetchScopedResponderMarkers(subAdminUserId: string): Promise<GisMapMarkerDto[]> {
    const jurisdiction = await resolveSubAdminJurisdiction(subAdminUserId);
    const subAdmin = await User.findById(subAdminUserId)
        .select('state city licenseId')
        .lean();
    if (!subAdmin) return [];

    const stateRaw = typeof subAdmin.state === 'string' ? subAdmin.state.trim() : '';
    const stateCode = normalizeStateToUsps(stateRaw);
    const licenseId = subAdmin.licenseId;

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
        .select('name location city state responderVertical responderFunction')
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
    let geocodeBudget = 30;

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
        await pushMarker(String(u._id), String(u.name || 'Responder'), unitType, 'Active', locationStr, null, jurisdiction);
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
    user: { state?: string | null },
    stateRaw?: string
): boolean {
    if (!stateRaw?.trim()) return true;
    const st = String(user.state ?? '').trim();
    if (!st) return false;
    const usps = normalizeStateToUsps(stateRaw);
    const userUsps = normalizeStateToUsps(st);
    if (usps && userUsps) return usps === userUsps;
    return stateRegex(stateRaw).test(st);
}

/** Super-admin: approved citizens from `User` (not legacy seed collections). */
export async function fetchNationwideCitizenMarkers(opts?: {
    stateRaw?: string;
}): Promise<GisMapMarkerDto[]> {
    const users = await User.find({
        role: { $in: [...CITIZEN_ROLES] },
        accountStatus: 'approved',
    })
        .select('name location city state zipcode isSafe lat lng')
        .limit(500)
        .lean();

    const markers: GisMapMarkerDto[] = [];
    let geocodeBudget = 60;

    for (const u of users) {
        if (!userMatchesStateFilter(u, opts?.stateRaw)) continue;

        const locationStr =
            (typeof u.location === 'string' && u.location.trim()) ||
            [u.city, u.state, u.zipcode].filter(Boolean).join(', ');

        let coords: { lat: number; lng: number } | null = null;
        if (typeof u.lat === 'number' && typeof u.lng === 'number') {
            coords = { lat: u.lat, lng: u.lng };
        } else if (geocodeBudget > 0) {
            coords = await resolveCoords(null, null, locationStr);
            if (coords) geocodeBudget -= 1;
        }
        if (!coords) continue;

        const isSafe = u.isSafe !== false;
        markers.push({
            id: String(u._id),
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
}): Promise<GisMapMarkerDto[]> {
    const responderUsers = await User.find({ role: 'responder' })
        .select('name location city state lat lng responderVertical responderFunction')
        .limit(300)
        .lean();

    const markers: GisMapMarkerDto[] = [];
    let geocodeBudget = 40;

    for (const u of responderUsers) {
        if (!userMatchesStateFilter(u, opts?.stateRaw)) continue;

        const unitType =
            String(u.responderVertical || u.responderFunction || 'Responder').replace(/_/g, ' ');
        const locationStr =
            (typeof u.location === 'string' && u.location.trim()) ||
            [u.city, u.state].filter(Boolean).join(', ');

        let coords: { lat: number; lng: number } | null = null;
        if (typeof u.lat === 'number' && typeof u.lng === 'number') {
            coords = { lat: u.lat, lng: u.lng };
        } else if (geocodeBudget > 0) {
            coords = await resolveCoords(null, null, locationStr);
            if (coords) geocodeBudget -= 1;
        }
        if (!coords) continue;

        const visuals = responderVisuals(unitType);
        markers.push({
            id: String(u._id),
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
}): Promise<GisMapMarkerDto[]> {
    const admins = await User.find({ role: 'sub-admin' })
        .select('name city state country lat lng email')
        .limit(200)
        .lean();

    const markers: GisMapMarkerDto[] = [];
    let geocodeBudget = 30;

    for (const u of admins) {
        if (!userMatchesStateFilter(u, opts?.stateRaw)) continue;

        const locationStr = [u.city, u.state, u.country || 'USA'].filter(Boolean).join(', ');
        let coords: { lat: number; lng: number } | null = null;
        if (typeof u.lat === 'number' && typeof u.lng === 'number') {
            coords = { lat: u.lat, lng: u.lng };
        } else if (geocodeBudget > 0) {
            coords = await resolveCoords(null, null, locationStr);
            if (coords) geocodeBudget -= 1;
        }
        if (!coords) continue;

        markers.push({
            id: String(u._id),
            lat: coords.lat,
            lng: coords.lng,
            title: String(u.name || 'Sub-Admin'),
            type: 'user',
            status: 'Online',
            location: locationStr,
            description: `Sub-Admin · ${locationStr}`,
        });
    }

    return markers;
}
