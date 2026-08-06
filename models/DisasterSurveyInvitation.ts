import { Schema, model, models } from 'mongoose';
import type { DisasterSurveyInvitationStatus } from '@/lib/types/disaster-survey';

const DisasterSurveyInvitationSchema = new Schema(
    {
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'DisasterSurveyCampaign',
            required: true,
            index: true,
        },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        status: {
            type: String,
            enum: [
                'pending',
                'opened',
                'submitted',
                'needs_info',
            ] satisfies DisasterSurveyInvitationStatus[],
            default: 'pending',
            index: true,
        },
        userEmail: { type: String, default: '' },
        userState: { type: String, default: '', index: true },
        userLat: { type: Number, default: null },
        userLng: { type: Number, default: null },
        pushSentAt: { type: Date, default: null },
        emailSentAt: { type: Date, default: null },
        openedAt: { type: Date, default: null },
        submittedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

DisasterSurveyInvitationSchema.index({ campaignId: 1, userId: 1 }, { unique: true });
DisasterSurveyInvitationSchema.index({ userId: 1, status: 1, createdAt: -1 });

const DisasterSurveyInvitation =
    models.DisasterSurveyInvitation ||
    model('DisasterSurveyInvitation', DisasterSurveyInvitationSchema);

export default DisasterSurveyInvitation;
