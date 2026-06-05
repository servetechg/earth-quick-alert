import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import UserProfile from '@/models/UserProfile';
import type { ApiUser, AlertLocationPayload, UserProfilePayload } from '@/lib/types/mobile/auth';
import { normalizeAlertLocationsForSave } from '@/lib/services/mobile/normalize-alert-locations';
import { toApiUser } from '@/lib/auth/mobile/user-mapper';
import { saveUserProfile, loadUserProfile, reloadApiUser } from '@/lib/services/mobile/auth-service';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';

const MAX_ALERT_LOCATIONS = 5;

export async function patchMobileUserAccount(
    userId: string,
    patch: { firstName?: string; lastName?: string; email?: string; phone?: string },
): Promise<ApiUser | null> {
    await connectDB();
    const update: Record<string, unknown> = {};
    if (patch.firstName !== undefined) update.firstName = patch.firstName.trim();
    if (patch.lastName !== undefined) update.lastName = patch.lastName.trim();
    if (patch.firstName !== undefined || patch.lastName !== undefined) {
        const fn = patch.firstName?.trim() ?? '';
        const ln = patch.lastName?.trim() ?? '';
        if (fn || ln) update.name = `${fn} ${ln}`.trim();
    }
    if (patch.email !== undefined) {
        update.email = patch.email.toLowerCase().trim();
    }
    if (patch.phone !== undefined) {
        const phone = patch.phone.trim();
        update.phoneNumber = phone;
    }

    if (Object.keys(update).length === 0) {
        return reloadApiUser(userId);
    }

    const doc = await User.findByIdAndUpdate(userId, { $set: update }, { new: true });
    if (!doc) return null;
    return toApiUser(doc);
}

export async function patchMobileProfile(
    userId: string,
    partial: Partial<UserProfilePayload>,
): Promise<UserProfilePayload | null> {
    await connectDB();
    const user = await User.findById(userId).lean();
    if (!user?.profileComplete) {
        const err = new Error('PROFILE_INCOMPLETE');
        (err as Error & { code: string }).code = 'PROFILE_INCOMPLETE';
        throw err;
    }

    const existing = await UserProfile.findOne({ userId }).lean();
    if (!existing) {
        const err = new Error('PROFILE_INCOMPLETE');
        (err as Error & { code: string }).code = 'PROFILE_INCOMPLETE';
        throw err;
    }

    const merged: UserProfilePayload = {
        address: partial.address ?? existing.address,
        householdSize: partial.householdSize ?? existing.householdSize,
        ada: partial.ada ?? existing.ada,
        medical: partial.medical ?? existing.medical,
        pets: partial.pets ?? existing.pets,
        transport: partial.transport ?? existing.transport,
        lodging: partial.lodging ?? existing.lodging,
        alertLocations: partial.alertLocations ?? existing.alertLocations ?? [],
    };

    await saveUserProfile(userId, merged);
    return loadUserProfile(userId) as Promise<UserProfilePayload | null>;
}

export async function replaceAlertLocations(
    userId: string,
    locations: AlertLocationPayload[],
): Promise<AlertLocationPayload[]> {
    if (locations.length > MAX_ALERT_LOCATIONS) {
        const err = new Error('LOCATION_LIMIT_EXCEEDED');
        (err as Error & { code: string }).code = 'LOCATION_LIMIT_EXCEEDED';
        throw err;
    }

    await connectDB();
    const user = await User.findById(userId).lean();
    if (!user?.profileComplete) {
        const err = new Error('PROFILE_INCOMPLETE');
        (err as Error & { code: string }).code = 'PROFILE_INCOMPLETE';
        throw err;
    }

    const normalized = normalizeAlertLocationsForSave(locations);

    await UserProfile.findOneAndUpdate(
        { userId },
        { $set: { alertLocations: normalized } },
        { new: true },
    );

    return normalized;
}

export async function ensureProfileLocationOnUser(userId: string) {
    const profile = await loadUserProfile(userId);
    const loc = formatProfileAddress(profile?.address);
    if (loc) {
        await User.updateOne({ _id: userId }, { $set: { location: loc } });
    }
}
