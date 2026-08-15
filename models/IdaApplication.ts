import { Schema, model, models } from 'mongoose';
import {
    IDA_DOCUMENT_KIND_IDS,
    IDA_FINANCIAL_IMPACT_IDS,
    IDA_HOUSING_DAMAGE_IDS,
    IDA_IMMEDIATE_NEED_IDS,
    IDA_INSURANCE_TYPE_IDS,
    IDA_LIVING_SITUATION_IDS,
    IDA_MISSING_FIELD_IDS,
    IDA_SAFE_TO_LIVE_IDS,
    type IdaApplicationStatus,
} from '@/lib/types/ida';

const MediaRefSchema = new Schema(
    {
        url: { type: String, required: true },
        fileName: { type: String, default: '' },
        mimeType: { type: String, default: '' },
        publicId: { type: String, default: '' },
        resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
        kind: {
            type: String,
            enum: IDA_DOCUMENT_KIND_IDS,
            default: 'damage_photo',
        },
    },
    { _id: false },
);

const IdaApplicationSchema = new Schema(
    {
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'IdaCampaign',
            required: true,
            index: true,
        },
        invitationId: {
            type: Schema.Types.ObjectId,
            ref: 'IdaInvitation',
            required: true,
            unique: true,
        },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        claimNumber: { type: String, required: true, unique: true, index: true },

        /** Sections 1–2 confirmed snapshot at submit */
        applicant: { type: Schema.Types.Mixed, default: {} },
        household: { type: Schema.Types.Mixed, default: {} },

        /** Section 3 */
        disasterType: { type: String, default: '' },
        dateOfImpact: { type: String, default: '' },
        didEvacuate: { type: Boolean, default: null },
        currentLocation: { type: String, default: '' },
        homeAccessible: { type: Boolean, default: null },

        /** Section 4 */
        housingDamage: {
            type: String,
            enum: [...IDA_HOUSING_DAMAGE_IDS, ''],
            default: '',
        },
        safeToLive: {
            type: String,
            enum: [...IDA_SAFE_TO_LIVE_IDS, ''],
            default: '',
        },
        livingSituation: {
            type: String,
            enum: [...IDA_LIVING_SITUATION_IDS, ''],
            default: '',
        },
        livingSituationOther: { type: String, default: '' },

        /** Section 5 */
        immediateNeeds: {
            type: [String],
            enum: IDA_IMMEDIATE_NEED_IDS,
            default: [],
        },
        immediateNeedsOther: { type: String, default: '' },

        /** Section 6 — kept on application (not public profile) for privacy */
        insuranceTypes: {
            type: [String],
            enum: IDA_INSURANCE_TYPE_IDS,
            default: [],
        },
        insuranceCompany: { type: String, default: '' },
        contactedInsurance: { type: Boolean, default: null },
        /** Opaque partner reference for future FEMA/insurer integrations */
        partnerRef: { type: String, default: '' },

        /** Section 7 */
        financialImpact: {
            type: String,
            enum: [...IDA_FINANCIAL_IMPACT_IDS, ''],
            default: '',
        },

        /** Section 10 — optional */
        documents: { type: [MediaRefSchema], default: [] },

        requestedMissingFields: {
            type: [String],
            enum: IDA_MISSING_FIELD_IDS,
            default: [],
        },
        missingInfoRequestedAt: { type: Date, default: null },

        profileSnapshot: { type: Schema.Types.Mixed, default: {} },
        userSnapshot: {
            id: String,
            name: String,
            email: String,
            phone: String,
            address: String,
            state: String,
            city: String,
            lat: Number,
            lng: Number,
        },

        applicationStatus: {
            type: String,
            enum: [
                'pending',
                'in_review',
                'needs_info',
                'referred',
                'closed',
            ] satisfies IdaApplicationStatus[],
            default: 'pending',
            index: true,
        },
        adminNotes: { type: String, default: '' },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

        submittedAt: { type: Date, required: true },
        userState: { type: String, default: '', index: true },
        userLat: { type: Number, default: null },
        userLng: { type: Number, default: null },
    },
    { timestamps: true },
);

IdaApplicationSchema.index({ campaignId: 1, submittedAt: -1 });
IdaApplicationSchema.index({ applicationStatus: 1, submittedAt: -1 });

const IdaApplication = models.IdaApplication || model('IdaApplication', IdaApplicationSchema);

export default IdaApplication;
