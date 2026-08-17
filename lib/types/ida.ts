/** Initial Disaster Assistance Application (IDA) — shared types */

export const IDA_HOUSING_DAMAGE_IDS = [
    'no_damage',
    'minor_damage',
    'moderate_damage',
    'major_damage',
    'destroyed',
    'unknown',
] as const;
export type IdaHousingDamageId = (typeof IDA_HOUSING_DAMAGE_IDS)[number];

export const IDA_SAFE_TO_LIVE_IDS = ['yes', 'no', 'unsure'] as const;
export type IdaSafeToLiveId = (typeof IDA_SAFE_TO_LIVE_IDS)[number];

export const IDA_LIVING_SITUATION_IDS = [
    'home',
    'hotel',
    'shelter',
    'friends_family',
    'vehicle',
    'other',
] as const;
export type IdaLivingSituationId = (typeof IDA_LIVING_SITUATION_IDS)[number];

export const IDA_IMMEDIATE_NEED_IDS = [
    'food',
    'drinking_water',
    'temporary_housing',
    'medical_assistance',
    'prescription_medications',
    'transportation',
    'fuel',
    'clothing',
    'child_care',
    'elder_care',
    'pet_assistance',
    'mental_health_support',
    'debris_removal',
    'generator',
    'other',
] as const;
export type IdaImmediateNeedId = (typeof IDA_IMMEDIATE_NEED_IDS)[number];

export const IDA_INSURANCE_TYPE_IDS = [
    'homeowners',
    'renters',
    'flood',
    'vehicle',
    'business',
    'none',
] as const;
export type IdaInsuranceTypeId = (typeof IDA_INSURANCE_TYPE_IDS)[number];

export const IDA_FINANCIAL_IMPACT_IDS = [
    'under_5k',
    '5k_25k',
    '25k_50k',
    '50k_100k',
    'over_100k',
    'unknown',
] as const;
export type IdaFinancialImpactId = (typeof IDA_FINANCIAL_IMPACT_IDS)[number];

export const IDA_DOCUMENT_KIND_IDS = [
    'gov_id',
    'insurance_policy',
    'damage_photo',
    'utility_bill',
    'lease_or_deed',
] as const;
export type IdaDocumentKindId = (typeof IDA_DOCUMENT_KIND_IDS)[number];

export const IDA_MISSING_FIELD_IDS = [
    'documents',
    'insurance_company',
    'current_location',
] as const;
export type IdaMissingFieldId = (typeof IDA_MISSING_FIELD_IDS)[number];

export type IdaCampaignStatus = 'draft' | 'dispatched' | 'closed';
export type IdaTriggerType = 'manual' | 'auto';
export type IdaTargetMode = 'alert_area' | 'specific' | 'all_scope';
export type IdaInvitationStatus = 'pending' | 'opened' | 'submitted' | 'needs_info';
export type IdaApplicationStatus =
    | 'pending'
    | 'in_review'
    | 'needs_info'
    | 'referred'
    | 'closed';

export type IdaMediaRef = {
    url: string;
    fileName: string;
    mimeType?: string;
    publicId?: string;
    resourceType?: 'image' | 'video' | 'raw';
};

export type IdaDocumentRef = IdaMediaRef & {
    kind: IdaDocumentKindId;
};

export type IdaApplicantPrefill = {
    fullName: string;
    dateOfBirth?: string;
    phoneNumber: string;
    email: string;
    preferredContactMethod?: string;
    currentLocation?: string;
    lat?: number | null;
    lng?: number | null;
    preferredLanguage?: string;
};

export type IdaHouseholdPrefill = {
    disasterAffectedAddress: string;
    isPrimaryResidence?: boolean | null;
    householdSize?: number | null;
    adults?: number | null;
    children?: number | null;
    seniors?: number | null;
    disabilitiesOrAccessNeeds?: string;
    electricityDependentMedical?: string;
    petsOrLivestock?: string;
};

export type IdaDisasterPrefill = {
    disasterType: string;
    dateOfImpact: string;
};

export const IDA_DEFAULT_TITLE = 'Initial Disaster Assistance Application';

export const IDA_DEFAULT_DESCRIPTION = [
    'If your property or possessions have been damaged, complete this application to get the reimbursement process started.',
    'Responses will be provided to all eligible programs.',
    'Please note, this is just the initiation of the process and allow a minimum of 3 days post disaster for entities (Federal, State, Insurance company, etc) to get back to you.',
    'A copy of your responses with claim number will be sent to the email address you provided when registering with Ready2Go.',
].join(' ');

/** Hours after alert/incident end before auto IDA dispatch. */
export const IDA_DEFAULT_DELAY_HOURS = 4;
