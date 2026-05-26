import bcrypt from 'bcryptjs';
import User from '@/models/User';
import UserProfile from '@/models/UserProfile';
import AuthPasswordReset, { hashResetToken } from '@/models/AuthPasswordReset';
import type { ApiUser, AuthResponse, UserProfilePayload } from '@/lib/types/mobile/auth';
import { toApiUser } from '@/lib/auth/mobile/user-mapper';
import {
    issueRefreshToken,
    randomToken,
    revokeAllRefreshTokens,
    revokeRefreshToken,
    signAccessToken,
} from '@/lib/auth/mobile/tokens';

const RESET_TTL_MS = 15 * 60 * 1000;

/** Mobile citizen accounts only */
const MOBILE_ROLE = 'user';

export async function buildAuthResponse(userDoc: {
    _id: { toString(): string };
    email: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    emailVerified?: boolean;
    profileComplete?: boolean;
}): Promise<AuthResponse> {
    const user = toApiUser(userDoc);
    const accessToken = await signAccessToken(user);
    const refreshToken = await issueRefreshToken(userDoc._id);
    return { user, accessToken, refreshToken };
}

export async function findMobileUserByEmail(email: string) {
    return User.findOne({ email: email.toLowerCase().trim(), role: MOBILE_ROLE }).select('+password');
}

export async function createMobileUser(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
}) {
    const email = input.email.toLowerCase().trim();
    const hashed = await bcrypt.hash(input.password, 10);
    return User.create({
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        name: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
        email,
        password: hashed,
        role: MOBILE_ROLE,
        accountStatus: 'approved',
        emailVerified: false,
        profileComplete: false,
    });
}

export async function issuePasswordResetToken(userId: string, email: string): Promise<string> {
    const raw = randomToken(32);
    const tokenHash = hashResetToken(raw);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await AuthPasswordReset.updateMany({ userId, usedAt: null }, { $set: { usedAt: new Date() } });

    await AuthPasswordReset.create({
        userId,
        email: email.toLowerCase().trim(),
        tokenHash,
        expiresAt,
    });

    return raw;
}

export async function consumePasswordResetToken(
    resetToken: string,
): Promise<{ userId: string } | null> {
    const tokenHash = hashResetToken(resetToken);
    const row = await AuthPasswordReset.findOne({ tokenHash, usedAt: null });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    row.usedAt = new Date();
    await row.save();
    return { userId: row.userId.toString() };
}

export async function saveUserProfile(
    userId: string,
    profile: UserProfilePayload,
): Promise<void> {
    const address = profile.address;
    await UserProfile.findOneAndUpdate(
        { userId },
        {
            $set: {
                address: {
                    streetAddress: address.streetAddress,
                    aptUnit: address.aptUnit ?? '',
                    city: address.city,
                    state: address.state,
                    zipCode: address.zipCode,
                    useCurrentLocation: address.useCurrentLocation,
                },
                householdSize: profile.householdSize,
                ada: profile.ada,
                medical: profile.medical,
                pets: profile.pets,
                transport: profile.transport,
                lodging: profile.lodging,
            },
        },
        { upsert: true, new: true },
    );

    await User.updateOne(
        { _id: userId },
        {
            $set: {
                profileComplete: true,
                city: address.city,
                state: address.state,
                zipcode: address.zipCode,
                location: [address.streetAddress, address.city, address.state, address.zipCode]
                    .filter(Boolean)
                    .join(', '),
            },
        },
    );
}

export async function loadUserProfile(userId: string) {
    const doc = await UserProfile.findOne({ userId }).lean();
    if (!doc) return null;
    return {
        address: doc.address,
        householdSize: doc.householdSize,
        ada: doc.ada,
        medical: doc.medical,
        pets: doc.pets,
        transport: doc.transport,
        lodging: doc.lodging,
    };
}

export async function logoutUser(userId: string, refreshToken?: string) {
    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    } else {
        await revokeAllRefreshTokens(userId);
    }
}

export function isMobileUserRole(role: string): boolean {
    return role === MOBILE_ROLE;
}

export async function reloadApiUser(userId: string): Promise<ApiUser | null> {
    const doc = await User.findById(userId);
    if (!doc) return null;
    return toApiUser(doc);
}
