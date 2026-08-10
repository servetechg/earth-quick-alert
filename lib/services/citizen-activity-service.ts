import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import CitizenActivity, { type ICitizenActivity } from '@/models/CitizenActivity';
import { CITIZEN_ACTIVITY_CATEGORY_META, categoryMatchesFilter } from '@/lib/citizen-activity/category-meta';
import type {
    CitizenActivityCategory,
    CitizenActivityFilter,
    CitizenActivityItem,
    CitizenActivityPriority,
    CitizenActivityStats,
} from '@/lib/citizen-activity/types';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import {
    coordinatesInJurisdiction,
    resolveSubAdminJurisdiction,
    type SubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { maybeDemoJurisdictionOverride } from '@/lib/demo/provider';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { geocodeLocation } from '@/lib/services/location-matching';
import {
    notifyAdminsOfCitizenActivity,
    notifyCitizenOfReportResolution,
} from '@/lib/services/user-notification-service';
import {
    CITIZEN_ACTIVITY_MAX_PICTURES,
    CITIZEN_ACTIVITY_MAX_VIDEOS,
    normalizeMediaList,
    type CitizenActivityMediaRef,
} from '@/lib/services/citizen-activity-media-service';

export const MOBILE_REPORT_CATEGORIES = [
    'help_request',
    'medical_assistance',
    'water_rescue',
    'road_hazard',
    'damage_report',
    'supply_request',
    'missing_person',
] as const;

export type MobileReportCategory = (typeof MOBILE_REPORT_CATEGORIES)[number];

function formatDisplayTime(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function displayName(user: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
}): string {
    const first = String(user.firstName ?? '').trim();
    const last = String(user.lastName ?? '').trim();
    if (first || last) return `${first} ${last}`.trim();
    const name = String(user.name ?? '').trim();
    if (name) return name;
    return String(user.email ?? 'Citizen').split('@')[0] || 'Citizen';
}

function defaultPriority(category: CitizenActivityCategory): CitizenActivityPriority {
    switch (category) {
        case 'help_request':
        case 'medical_assistance':
        case 'water_rescue':
        case 'missing_person':
            return 'critical';
        case 'road_hazard':
        case 'damage_report':
        case 'supply_request':
        case 'power_outage':
            return 'high';
        case 'safe_checkin':
        case 'shelter_checkin':
        case 'volunteer':
            return 'low';
        default:
            return 'normal';
    }
}

function initialTakeAction(
    category: CitizenActivityCategory,
    citizenName: string,
    address: string,
): string {
    const place = address || 'the reported location';
    switch (category) {
        case 'help_request':
        case 'water_rescue':
            return `${citizenName} requested help at ${place}. Ready2Go is reviewing the report and dispatching the appropriate crew.`;
        case 'medical_assistance':
            return `${citizenName} reported a medical need at ${place}. Ready2Go is coordinating EMS response.`;
        case 'safe_checkin':
            return `${citizenName} marked safe at ${place}. Ready2Go logged the check-in and updated the command feed.`;
        case 'road_hazard':
            return `${citizenName} reported a road hazard at ${place}. Ready2Go is routing infrastructure crews.`;
        case 'supply_request':
            return `${citizenName} needs supplies at ${place}. Ready2Go is matching logistics support.`;
        case 'damage_report':
            return `${citizenName} reported property damage at ${place}. Ready2Go dispatched assessment teams.`;
        case 'missing_person':
            return `${citizenName} submitted a missing-person update for ${place}. Ready2Go search coordinators are tracing details.`;
        default:
            return `${citizenName} — ${CITIZEN_ACTIVITY_CATEGORY_META[category].label} at ${place}. Ready2Go teams are monitoring this activity.`;
    }
}

async function resolveUserLocationSnapshot(
    userId: string,
    profile: UserProfilePayload | null,
    input?: { lat?: number; lng?: number; location?: string },
): Promise<{
    location: string;
    lat: number | null;
    lng: number | null;
    address: string;
    state: string;
    city: string;
}> {
    const userDoc = (await User.findById(userId).select('location state city lat lng phoneNumber').lean()) as {
        location?: string;
        state?: string;
        city?: string;
        lat?: number | null;
        lng?: number | null;
    } | null;

    const address = formatProfileAddress(profile?.address) || String(userDoc?.location ?? '').trim();
    let location = input?.location?.trim() || address;
    let lat = input?.lat ?? (typeof userDoc?.lat === 'number' ? userDoc.lat : null);
    let lng = input?.lng ?? (typeof userDoc?.lng === 'number' ? userDoc.lng : null);

    if ((!lat || !lng) && location) {
        const geo = await geocodeLocation(location);
        if (geo) {
            lat = geo.lat;
            lng = geo.lon;
        }
    }

    const state =
        profile?.address?.state?.trim() ||
        String(userDoc?.state ?? '').trim() ||
        '';
    const city =
        profile?.address?.city?.trim() ||
        String(userDoc?.city ?? '').trim() ||
        '';

    if (!location) {
        location = [city, state].filter(Boolean).join(', ') || 'Location not provided';
    }

    return {
        location,
        lat: lat ?? null,
        lng: lng ?? null,
        address: address || location,
        state,
        city,
    };
}

export function mapCitizenActivityDocToFeedItem(
    doc: ICitizenActivity & { _id?: { toString(): string } },
): CitizenActivityItem {
    const created = doc.createdAt ? new Date(doc.createdAt) : new Date();
    const category = doc.category;
    const pictures = normalizeMediaList(doc.pictures, CITIZEN_ACTIVITY_MAX_PICTURES);
    const videos = normalizeMediaList(doc.videos, CITIZEN_ACTIVITY_MAX_VIDEOS);
    return {
        id: doc._id?.toString() ?? `activity-${created.getTime()}`,
        category,
        title: doc.title || CITIZEN_ACTIVITY_CATEGORY_META[category].label,
        line1: doc.description?.trim() || doc.title,
        line2: doc.details?.trim() || undefined,
        location: doc.location,
        timestamp: created.toISOString(),
        displayTime: formatDisplayTime(created),
        priority: doc.priority,
        status: doc.status,
        source: doc.source,
        citizenName: doc.citizenName,
        citizenAddress: doc.citizenAddress || doc.location,
        takeAction: doc.takeAction,
        resolutionStatus: doc.resolutionStatus,
        userId: String(doc.userId),
        pictures: pictures.length ? pictures : undefined,
        videos: videos.length ? videos : undefined,
    };
}

function activityInJurisdiction(
    row: { lat?: number | null; lng?: number | null; userState?: string; location?: string },
    jurisdiction: SubAdminJurisdiction,
): boolean {
    const lat = row.lat != null ? Number(row.lat) : null;
    const lng = row.lng != null ? Number(row.lng) : null;
    if (lat != null && lng != null && coordinatesInJurisdiction(lat, lng, jurisdiction)) {
        return true;
    }
    const state = normalizeStateToUsps(String(row.userState ?? ''));
    if (state && jurisdiction.stateCode && state === jurisdiction.stateCode) {
        return true;
    }
    return false;
}

export async function createCitizenActivityReport(
    userId: string,
    input: {
        category: MobileReportCategory;
        description: string;
        details?: string;
        lat?: number;
        lng?: number;
        location?: string;
        pictures?: CitizenActivityMediaRef[];
        videos?: CitizenActivityMediaRef[];
    },
) {
    await connectDB();
    const profile = (await loadUserProfile(userId)) as UserProfilePayload | null;
    const user = await User.findById(userId).select('firstName lastName name email phoneNumber').lean();
    if (!user) throw new Error('USER_NOT_FOUND');

    const loc = await resolveUserLocationSnapshot(userId, profile, input);
    const citizenName = displayName(user as Parameters<typeof displayName>[0]);
    const category = input.category as CitizenActivityCategory;
    const title = CITIZEN_ACTIVITY_CATEGORY_META[category].label;
    const description = input.description.trim();
    if (!description) throw new Error('DESCRIPTION_REQUIRED');

    const pictures = normalizeMediaList(input.pictures, CITIZEN_ACTIVITY_MAX_PICTURES);
    const videos = normalizeMediaList(input.videos, CITIZEN_ACTIVITY_MAX_VIDEOS);

    const doc = await CitizenActivity.create({
        userId,
        category,
        title,
        description,
        details: input.details?.trim() ?? '',
        location: loc.location,
        lat: loc.lat,
        lng: loc.lng,
        userState: loc.state,
        userCity: loc.city,
        citizenName,
        citizenAddress: loc.address,
        citizenPhone: String((user as { phoneNumber?: string }).phoneNumber ?? '').trim(),
        priority: defaultPriority(category),
        status: 'Open',
        resolutionStatus: 'pending',
        takeAction: initialTakeAction(category, citizenName, loc.address),
        source: 'citizen',
        pictures,
        videos,
    });

    const activityObj = doc.toObject() as ICitizenActivity;
    void notifyAdminsOfCitizenActivity(activityObj).catch((err) => {
        console.warn('[citizen-activity] admin notification failed:', err);
    });

    return mapCitizenActivityDocToFeedItem(activityObj);
}

export async function createSafeCheckInActivity(
    userId: string,
    input: { isSafe: boolean; message?: string },
) {
    await connectDB();
    const profile = (await loadUserProfile(userId)) as UserProfilePayload | null;
    const user = await User.findById(userId).select('firstName lastName name email phoneNumber isSafe').lean();
    if (!user) throw new Error('USER_NOT_FOUND');

    await User.findByIdAndUpdate(userId, { isSafe: input.isSafe });

    const loc = await resolveUserLocationSnapshot(userId, profile);
    const citizenName = displayName(user as Parameters<typeof displayName>[0]);
    const category: CitizenActivityCategory = input.isSafe ? 'safe_checkin' : 'help_request';
    const title = input.isSafe ? 'Safe Check-In' : 'Help Request';
    const description =
        input.message?.trim() ||
        (input.isSafe
            ? `${citizenName} marked safe`
            : `${citizenName} needs assistance`);

    const doc = await CitizenActivity.create({
        userId,
        category,
        title,
        description,
        details: input.message?.trim() ?? '',
        location: loc.location,
        lat: loc.lat,
        lng: loc.lng,
        userState: loc.state,
        userCity: loc.city,
        citizenName,
        citizenAddress: loc.address,
        citizenPhone: String((user as { phoneNumber?: string }).phoneNumber ?? '').trim(),
        priority: input.isSafe ? 'low' : 'critical',
        status: input.isSafe ? 'Safe' : 'Open',
        resolutionStatus: input.isSafe ? 'completed' : 'pending',
        takeAction: initialTakeAction(category, citizenName, loc.address),
        source: 'citizen',
    });

    const activityObj = doc.toObject() as ICitizenActivity;
    if (!input.isSafe) {
        void notifyAdminsOfCitizenActivity(activityObj).catch((err) => {
            console.warn('[citizen-activity] admin notification failed:', err);
        });
    }

    return mapCitizenActivityDocToFeedItem(activityObj);
}

export async function listCitizenActivitiesForUser(userId: string, limit = 20) {
    await connectDB();
    const docs = await CitizenActivity.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    return docs.map((doc) =>
        mapCitizenActivityDocToFeedItem(doc as ICitizenActivity & { _id: { toString(): string } }),
    );
}

export async function listCitizenActivitiesForAdmin(opts: {
    adminUserId: string;
    role: string;
    filter: CitizenActivityFilter;
    query: string;
    limit: number;
    includeDemoSeed?: boolean;
}) {
    await connectDB();
    const { adminUserId, role, filter, query, limit, includeDemoSeed } = opts;

    let jurisdiction: SubAdminJurisdiction | null = null;
    if (role === 'sub-admin') {
        jurisdiction =
            (await maybeDemoJurisdictionOverride(adminUserId)) ??
            (await resolveSubAdminJurisdiction(adminUserId));
    }

    const docs = await CitizenActivity.find({})
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();

    let items = docs
        .filter((doc) => {
            if (!jurisdiction) return true;
            return activityInJurisdiction(
                {
                    lat: doc.lat,
                    lng: doc.lng,
                    userState: doc.userState,
                    location: doc.location,
                },
                jurisdiction,
            );
        })
        .map((doc) =>
            mapCitizenActivityDocToFeedItem(doc as ICitizenActivity & { _id: { toString(): string } }),
        );

    if (filter !== 'all' || query.trim()) {
        items = filterActivityItems(items, filter, query);
    }

    return {
        items: items.slice(0, limit),
        stats: buildActivityStatsFromItems(items),
        includeDemoSeed: Boolean(includeDemoSeed),
    };
}

export function filterActivityItems(
    items: CitizenActivityItem[],
    filter: CitizenActivityFilter,
    query: string,
): CitizenActivityItem[] {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
        if (filter !== 'all' && !categoryMatchesFilter(item.category, filter)) {
            return false;
        }
        if (!q) return true;
        const blob = [
            item.title,
            item.line1,
            item.line2,
            item.location,
            item.status,
            item.citizenName,
            item.citizenAddress,
            item.takeAction,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return blob.includes(q);
    });
}

export function buildActivityStatsFromItems(items: CitizenActivityItem[]): CitizenActivityStats {
    return {
        helpRequests: items.filter((i) =>
            ['help_request', 'water_rescue', 'supply_request', 'damage_report', 'missing_person'].includes(
                i.category,
            ),
        ).length,
        safeCheckIns: items.filter((i) =>
            ['safe_checkin', 'shelter_checkin', 'volunteer'].includes(i.category),
        ).length,
        infrastructureAlerts: items.filter((i) =>
            ['power_outage', 'road_hazard', 'evacuation'].includes(i.category),
        ).length,
        medicalAssistance: items.filter((i) => i.category === 'medical_assistance').length,
        total: items.length,
    };
}

export async function updateCitizenActivityForAdmin(
    activityId: string,
    adminUserId: string,
    patch: {
        status?: string;
        resolutionStatus?: 'pending' | 'completed';
        takeAction?: string;
    },
) {
    await connectDB();
    const update: Record<string, unknown> = {};
    if (patch.status?.trim()) update.status = patch.status.trim();
    if (patch.resolutionStatus) update.resolutionStatus = patch.resolutionStatus;
    if (patch.takeAction !== undefined) update.takeAction = patch.takeAction.trim();
    if (Object.keys(update).length === 0) throw new Error('NO_CHANGES');

    update.reviewedBy = adminUserId;
    update.reviewedAt = new Date();

    const doc = await CitizenActivity.findByIdAndUpdate(activityId, update, { new: true }).lean();
    if (!doc) throw new Error('NOT_FOUND');

    if (patch.resolutionStatus === 'completed') {
        void notifyCitizenOfReportResolution(doc as ICitizenActivity).catch((err) => {
            console.warn('[citizen-activity] citizen resolution notification failed:', err);
        });
    }

    return mapCitizenActivityDocToFeedItem(doc as ICitizenActivity & { _id: { toString(): string } });
}
