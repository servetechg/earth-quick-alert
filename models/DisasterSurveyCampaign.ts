import { Schema, model, models } from 'mongoose';
import {
    type DisasterSurveyCampaignStatus,
    type DisasterSurveyTargetMode,
    type DisasterSurveyTriggerType,
} from '@/lib/types/disaster-survey';

const DisasterSurveyCampaignSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        triggerType: {
            type: String,
            enum: ['manual', 'auto'] satisfies DisasterSurveyTriggerType[],
            default: 'manual',
        },
        status: {
            type: String,
            enum: ['draft', 'dispatched', 'closed'] satisfies DisasterSurveyCampaignStatus[],
            default: 'draft',
            index: true,
        },
        sourceEventId: { type: String, default: '', index: true },
        eventSummary: { type: String, default: '' },
        severity: { type: String, default: '' },
        stateCodes: { type: [String], default: [] },
        createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        dispatchedAt: { type: Date, default: null },
        invitedCount: { type: Number, default: 0 },
        responseCount: { type: Number, default: 0 },
        autoTriggerKey: { type: String, default: '', index: true },
        /**
         * alert_area — users in active alert polygons
         * specific — targetUserIds only
         * all_scope — all app users (super-admin) or all users in sub-admin jurisdiction
         */
        targetMode: {
            type: String,
            enum: ['alert_area', 'specific', 'all_scope'] satisfies DisasterSurveyTargetMode[],
            default: 'alert_area',
        },
        /** When set, dispatch invites only these users instead of alert-area targeting. */
        targetUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    },
    { timestamps: true },
);

DisasterSurveyCampaignSchema.index({ status: 1, createdAt: -1 });

const DisasterSurveyCampaign =
    models.DisasterSurveyCampaign ||
    model('DisasterSurveyCampaign', DisasterSurveyCampaignSchema);

export default DisasterSurveyCampaign;
