import { buildDisasterSurveyProfileSnapshot } from '@/lib/services/disaster-survey-profile-snapshot';
import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type {
    IdaApplicantPrefill,
    IdaDisasterPrefill,
    IdaHouseholdPrefill,
} from '@/lib/types/ida';
import User from '@/models/User';
import UserProfile from '@/models/UserProfile';

function displayName(user: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
}): string {
    const full = String(user.name ?? '').trim();
    if (full) return full;
    const joined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return joined || String(user.email ?? 'Applicant');
}

function formatRequirement(section?: {
    hasRequirement?: boolean;
    selectedOptions?: string[];
    otherDetails?: string;
}): string {
    if (!section?.hasRequirement) return 'None reported';
    const parts = (section.selectedOptions ?? []).filter(Boolean);
    const other = String(section.otherDetails ?? '').trim();
    if (other) parts.push(other);
    return parts.length > 0 ? parts.join(', ') : 'Yes (no details provided)';
}

export async function buildIdaPrefill(
    userId: string,
    disaster?: Partial<IdaDisasterPrefill>,
): Promise<{
    applicant: IdaApplicantPrefill;
    household: IdaHouseholdPrefill;
    disaster: IdaDisasterPrefill;
    profileSnapshot: ReturnType<typeof buildDisasterSurveyProfileSnapshot>;
}> {
    const user = (await User.findById(userId)
        .select(
            'name firstName lastName email phoneNumber phone location state city lat lng notificationPreferences',
        )
        .lean()) as Record<string, unknown> | null;

    const profile = (await UserProfile.findOne({ userId }).lean()) as
        | (UserProfilePayload & Record<string, unknown>)
        | null;

    const name = user ? displayName(user as Parameters<typeof displayName>[0]) : 'Applicant';
    const email = String(user?.email ?? '').trim();
    const phone = String(user?.phoneNumber ?? user?.phone ?? '').trim();
    const address =
        formatProfileAddress(profile?.address ?? null) ||
        String(user?.location ?? '').trim() ||
        [user?.city, user?.state].filter(Boolean).join(', ');

    const prefs = (user?.notificationPreferences ?? {}) as Record<string, unknown>;
    const preferredContact =
        prefs.sms === true ? 'SMS' : prefs.email === true ? 'Email' : phone ? 'Phone' : '';

    const applicant: IdaApplicantPrefill = {
        fullName: name,
        dateOfBirth: '',
        phoneNumber: phone,
        email,
        preferredContactMethod: preferredContact,
        currentLocation: address,
        lat: user?.lat != null ? Number(user.lat) : null,
        lng: user?.lng != null ? Number(user.lng) : null,
        preferredLanguage: 'English',
    };

    const householdSize =
        typeof profile?.householdSize === 'number' ? profile.householdSize : null;

    const household: IdaHouseholdPrefill = {
        disasterAffectedAddress: address,
        isPrimaryResidence:
            typeof profile?.isPrimaryAddress === 'boolean' ? profile.isPrimaryAddress : null,
        householdSize,
        adults: null,
        children: null,
        seniors: null,
        disabilitiesOrAccessNeeds: formatRequirement(profile?.ada),
        electricityDependentMedical: formatRequirement(profile?.medical),
        petsOrLivestock: formatRequirement(profile?.pets),
    };

    return {
        applicant,
        household,
        disaster: {
            disasterType: String(disaster?.disasterType ?? '').trim() || 'Disaster event',
            dateOfImpact: String(disaster?.dateOfImpact ?? '').trim() || '',
        },
        profileSnapshot: buildDisasterSurveyProfileSnapshot(profile),
    };
}
