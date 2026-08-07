import { Schema, model, models } from 'mongoose';
import {
    DISASTER_IMMEDIATE_NEED_IDS,
    DISASTER_SURVEY_MISSING_FIELDS,
    type DisasterSurveyFundingStatus,
} from '@/lib/types/disaster-survey';

const MediaRefSchema = new Schema(
    {
        url: { type: String, required: true },
        fileName: { type: String, default: '' },
        mimeType: { type: String, default: '' },
        publicId: { type: String, default: '' },
        resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'image' },
    },
    { _id: false },
);

const DisasterSurveyResponseSchema = new Schema(
    {
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'DisasterSurveyCampaign',
            required: true,
            index: true,
        },
        invitationId: {
            type: Schema.Types.ObjectId,
            ref: 'DisasterSurveyInvitation',
            required: true,
            unique: true,
        },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        immediateNeeds: {
            type: [String],
            enum: DISASTER_IMMEDIATE_NEED_IDS,
            default: [],
        },
        comments: { type: String, default: '' },
        incidentPictures: { type: [MediaRefSchema], default: [] },
        incidentVideos: { type: [MediaRefSchema], default: [] },
        requestedMissingFields: {
            type: [String],
            enum: DISASTER_SURVEY_MISSING_FIELDS,
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
        fundingStatus: {
            type: String,
            enum: ['pending', 'approved', 'denied', 'needs_info'] satisfies DisasterSurveyFundingStatus[],
            default: 'pending',
            index: true,
        },
        fundingNotes: { type: String, default: '' },
        fundingReviewedAt: { type: Date, default: null },
        fundingReviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        submittedAt: { type: Date, required: true },
        userState: { type: String, default: '', index: true },
        userLat: { type: Number, default: null },
        userLng: { type: Number, default: null },
    },
    { timestamps: true },
);

DisasterSurveyResponseSchema.index({ campaignId: 1, submittedAt: -1 });
DisasterSurveyResponseSchema.index({ fundingStatus: 1, submittedAt: -1 });

const DisasterSurveyResponse =
    models.DisasterSurveyResponse || model('DisasterSurveyResponse', DisasterSurveyResponseSchema);

export default DisasterSurveyResponse;
