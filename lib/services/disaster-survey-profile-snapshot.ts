import { formatProfileAddress } from '@/lib/services/mobile/zone-utils';
import type { UserProfilePayload } from '@/lib/types/mobile/auth';
import type { DisasterSurveyProfileSnapshot } from '@/lib/types/disaster-survey';

type RequirementLike = {
    hasRequirement?: boolean;
    selectedOptions?: string[];
    otherDetails?: string;
};

type LodgingLike = {
    selectedOptions?: string[];
    otherDetails?: string;
};

type ProfileLike = {
    address?: UserProfilePayload['address'];
    householdSize?: number;
    ada?: RequirementLike;
    medical?: RequirementLike;
    pets?: RequirementLike;
    transport?: RequirementLike;
    lodging?: LodgingLike;
    alertLocations?: Array<{ label?: string; city?: string; state?: string }>;
    isPrimaryAddress?: boolean;
    allowResidenceInspection?: boolean;
    proofOfOwnership?: { fileName?: string; url?: string } | null;
    proofOfResidency?: { fileName?: string; url?: string } | null;
};

function formatRequirementSection(section: RequirementLike | undefined): string {
    if (!section?.hasRequirement) return 'None reported';
    const parts = (section.selectedOptions ?? []).filter(Boolean);
    const other = String(section.otherDetails ?? '').trim();
    if (other) parts.push(other);
    return parts.length > 0 ? parts.join(', ') : 'Yes (no details provided)';
}

function formatLodgingSection(section: LodgingLike | undefined): string {
    const parts = (section?.selectedOptions ?? []).filter(Boolean);
    const other = String(section?.otherDetails ?? '').trim();
    if (other) parts.push(other);
    return parts.length > 0 ? parts.join(', ') : 'Not specified';
}

function formatAlertLocations(
    locations: ProfileLike['alertLocations'],
): string[] {
    if (!Array.isArray(locations) || locations.length === 0) return [];
    return locations.map((loc) => {
        const label = String(loc.label ?? '').trim();
        const place = [loc.city, loc.state].filter(Boolean).join(', ');
        if (label && place) return `${label} — ${place}`;
        return label || place || 'Alert location';
    });
}

export function buildDisasterSurveyProfileSnapshot(
    profile: ProfileLike | null | undefined,
): DisasterSurveyProfileSnapshot {
    if (!profile) {
        return { householdSize: 0 };
    }

    const alertLocations = formatAlertLocations(profile.alertLocations);
    const snapshot: DisasterSurveyProfileSnapshot = {
        address: formatProfileAddress(profile.address ?? null) || undefined,
        householdSize: profile.householdSize ?? 0,
        ada: formatRequirementSection(profile.ada),
        medical: formatRequirementSection(profile.medical),
        pets: formatRequirementSection(profile.pets),
        transport: formatRequirementSection(profile.transport),
        lodging: formatLodgingSection(profile.lodging),
    };

    if (alertLocations.length > 0) snapshot.alertLocations = alertLocations;
    if (profile.isPrimaryAddress != null) {
        snapshot.isPrimaryAddress = profile.isPrimaryAddress ? 'Yes' : 'No';
    }
    if (profile.allowResidenceInspection != null) {
        snapshot.allowResidenceInspection = profile.allowResidenceInspection ? 'Yes' : 'No';
    }
    if (profile.proofOfOwnership?.url) {
        snapshot.proofOfOwnership = {
            fileName: profile.proofOfOwnership.fileName ?? 'Proof of ownership',
            url: profile.proofOfOwnership.url,
        };
    }
    if (profile.proofOfResidency?.url) {
        snapshot.proofOfResidency = {
            fileName: profile.proofOfResidency.fileName ?? 'Proof of residency',
            url: profile.proofOfResidency.url,
        };
    }

    return snapshot;
}

/** Normalize legacy raw Mongo profile documents saved before snapshot formatting. */
export function normalizeStoredProfileSnapshot(
    raw: Record<string, unknown> | null | undefined,
): DisasterSurveyProfileSnapshot {
    if (!raw || typeof raw !== 'object') return {};

    const isRawMongoDoc = '_id' in raw || 'userId' in raw || '__v' in raw;
    if (!isRawMongoDoc && typeof raw.ada === 'string') {
        return raw as DisasterSurveyProfileSnapshot;
    }

    return buildDisasterSurveyProfileSnapshot(raw as ProfileLike);
}
