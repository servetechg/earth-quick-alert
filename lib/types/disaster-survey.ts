export const DISASTER_IMMEDIATE_NEED_IDS = [
    'rescue_evacuation',
    'lodging_hotel',
    'food_supplies',
    'medical_assistance',
    'pet_rescue',
    'livestock_rescue',
    'transportation',
] as const;

export type DisasterImmediateNeedId = (typeof DISASTER_IMMEDIATE_NEED_IDS)[number];

export type DisasterSurveyFundingStatus =
    | 'pending'
    | 'approved'
    | 'denied'
    | 'needs_info';

export type DisasterSurveyCampaignStatus = 'draft' | 'dispatched' | 'closed';

export type DisasterSurveyTriggerType = 'manual' | 'auto';

/** Who receives invitations when a campaign is dispatched. */
export type DisasterSurveyTargetMode = 'alert_area' | 'specific' | 'all_scope';

export type DisasterSurveyInvitationStatus =
    | 'pending'
    | 'opened'
    | 'submitted'
    | 'needs_info';

export type DisasterSurveyMissingField =
    | 'comments'
    | 'incident_pictures'
    | 'incident_videos';

export const DISASTER_SURVEY_MISSING_FIELDS = [
    'comments',
    'incident_pictures',
    'incident_videos',
] as const satisfies readonly DisasterSurveyMissingField[];

export type DisasterSurveyMediaRef = {
    url: string;
    fileName: string;
    mimeType?: string;
    publicId?: string;
    resourceType?: 'image' | 'video' | 'raw';
};

export type DisasterSurveyProfileDocumentRef = {
    fileName: string;
    url: string;
};

export type DisasterSurveyProfileSnapshot = {
    address?: string;
    householdSize?: number;
    ada?: string;
    medical?: string;
    pets?: string;
    transport?: string;
    lodging?: string;
    alertLocations?: string[];
    isPrimaryAddress?: string;
    allowResidenceInspection?: string;
    proofOfOwnership?: DisasterSurveyProfileDocumentRef;
    proofOfResidency?: DisasterSurveyProfileDocumentRef;
};

export type DisasterSurveyUserSnapshot = {
    id: string;
    name: string;
    email: string;
    phone?: string;
    address?: string;
    state?: string;
    city?: string;
    lat?: number | null;
    lng?: number | null;
};
