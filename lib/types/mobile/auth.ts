/** Ready2Go mobile API — shared response shapes */

export type ApiUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    profileComplete: boolean;
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
};

export const OTP_PURPOSES = ['EMAIL_VERIFICATION', 'PASSWORD_RESET'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
