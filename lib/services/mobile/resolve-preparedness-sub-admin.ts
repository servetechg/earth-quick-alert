import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { geocodeLocation } from '@/lib/services/location-matching';
import { calculateDistance } from '@/lib/services/mock-map-service';
import {
    coordinatesInJurisdiction,
    resolveSubAdminJurisdiction,
} from '@/lib/sub-admin/jurisdiction';
import { normalizeStateToUsps } from '@/lib/utils/us-state-usps';
import { loadUserProfile } from '@/lib/services/mobile/auth-service';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';

export type PreparednessSubAdminScope = {
    subAdminId: string;
    userStateCode: string;
    coords: { lat: number; lng: number };
};

/**
 * Finds the sub-admin whose state matches the citizen profile and whose license
 * radius contains the geocoded home address. When multiple match, picks closest
 * to the license center.
 */
export async function resolvePreparednessSubAdminForUser(
    userId: string,
): Promise<PreparednessSubAdminScope | null> {
    await connectDB();

    const profile = await loadUserProfile(userId);
    const addressStr = formatProfileAddress(profile?.address);
    if (!addressStr || !profile?.address?.state?.trim()) {
        return null;
    }

    const userStateCode = normalizeStateToUsps(profile.address.state.trim());
    if (!userStateCode) {
        return null;
    }

    const geo = await geocodeLocation(addressStr);
    if (!geo) {
        return null;
    }

    const subAdmins = await User.find({
        role: 'sub-admin',
        state: { $exists: true, $nin: ['', null] },
    })
        .select('_id state')
        .lean();

    type Candidate = { subAdminId: string; distanceMile: number };
    const candidates: Candidate[] = [];

    for (const sa of subAdmins) {
        const saStateCode = normalizeStateToUsps(String(sa.state ?? '').trim());
        if (!saStateCode || saStateCode !== userStateCode) {
            continue;
        }

        const jurisdiction = await resolveSubAdminJurisdiction(String(sa._id));
        if (!jurisdiction) {
            continue;
        }

        if (!coordinatesInJurisdiction(geo.lat, geo.lon, jurisdiction)) {
            continue;
        }

        const distanceMile = calculateDistance(
            geo.lat,
            geo.lon,
            jurisdiction.center.lat,
            jurisdiction.center.lng,
        );
        candidates.push({ subAdminId: String(sa._id), distanceMile });
    }

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort((a, b) => a.distanceMile - b.distanceMile);
    return {
        subAdminId: candidates[0].subAdminId,
        userStateCode,
        coords: { lat: geo.lat, lng: geo.lon },
    };
}
