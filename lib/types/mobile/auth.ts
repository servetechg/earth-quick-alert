import type { ProfileDocumentRef } from '@/lib/types/mobile/profile-document';

/** Ready2Go mobile API — shared response shapes */

export type ApiUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    /** Cloudinary HTTPS URL; omitted when user has no photo */
    profilePic?: string;
    emailVerified: boolean;
    profileComplete: boolean;
    /** ISO timestamp — used for incomplete-profile reminder timing */
    createdAt?: string;
};

export type AlertLocationPayload = {
    /** Client may send `loc-{timestamp}-…`; server replaces on save with UUID */
    id?: string;
    label: string;
    city: string;
    state: string;
    /** Optional for alert-only locations; stored as `""` if omitted */
    zipCode?: string;
};

export type AuthResponse = {
    user: ApiUser;
    accessToken: string;
    refreshToken?: string;
};

export type FieldError = { field: string; message: string };

export type ApiErrorBody = {
    message: string;
    code?: string;
    errors?: FieldError[];
};

export type ProfileRequirementSection = {
    hasRequirement: boolean;
    selectedOptions: string[];
    otherDetails?: string;
};

export type ProfileLodgingSection = {
    selectedOptions: string[];
    otherDetails?: string;
};

export type UserProfilePayload = {
    address: {
        streetAddress: string;
        aptUnit?: string;
        city: string;
        state: string;
        zipCode: string;
        useCurrentLocation: boolean;
    };
    householdSize: number;
    ada: ProfileRequirementSection;
    medical: ProfileRequirementSection;
    pets: ProfileRequirementSection;
    transport: ProfileRequirementSection;
    lodging: ProfileLodgingSection;
    alertLocations?: AlertLocationPayload[];
    isPrimaryAddress?: boolean;
    allowResidenceInspection?: boolean;
    proofOfOwnership?: ProfileDocumentRef | null;
    proofOfResidency?: ProfileDocumentRef | null;
};

export const OTP_PURPOSES = ['EMAIL_VERIFICATION', 'PASSWORD_RESET'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
