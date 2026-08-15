import { Schema, model, models } from 'mongoose';
import type { IdaCampaignStatus, IdaTargetMode, IdaTriggerType } from '@/lib/types/ida';
import { IDA_DEFAULT_DELAY_HOURS } from '@/lib/types/ida';

const IdaCampaignSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        triggerType: {
            type: String,
            enum: ['manual', 'auto'] satisfies IdaTriggerType[],
            default: 'manual',
        },
        status: {
            type: String,
            enum: ['draft', 'dispatched', 'closed'] satisfies IdaCampaignStatus[],
            default: 'draft',
            index: true,
        },
        sourceEventId: { type: String, default: '', index: true },
        eventSummary: { type: String, default: '' },
        severity: { type: String, default: '' },
        disasterType: { type: String, default: '' },
        disasterDate: { type: String, default: '' },
        stateCodes: { type: [String], default: [] },
        createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        dispatchedAt: { type: Date, default: null },
        /** When auto-dispatch becomes eligible (incident end + delay). */
        eligibleAt: { type: Date, default: null, index: true },
        delayHours: { type: Number, default: IDA_DEFAULT_DELAY_HOURS },
        invitedCount: { type: Number, default: 0 },
        responseCount: { type: Number, default: 0 },
        autoTriggerKey: { type: String, default: '', index: true },
        targetMode: {
            type: String,
            enum: ['alert_area', 'specific', 'all_scope'] satisfies IdaTargetMode[],
            default: 'alert_area',
        },
        targetUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    },
    { timestamps: true },
);

IdaCampaignSchema.index({ status: 1, createdAt: -1 });
IdaCampaignSchema.index({ status: 1, eligibleAt: 1 });

const IdaCampaign = models.IdaCampaign || model('IdaCampaign', IdaCampaignSchema);

export default IdaCampaign;
