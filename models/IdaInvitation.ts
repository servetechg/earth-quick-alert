import { Schema, model, models } from 'mongoose';
import type { IdaInvitationStatus } from '@/lib/types/ida';

const IdaInvitationSchema = new Schema(
    {
        campaignId: {
            type: Schema.Types.ObjectId,
            ref: 'IdaCampaign',
            required: true,
            index: true,
        },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        status: {
            type: String,
            enum: ['pending', 'opened', 'submitted', 'needs_info'] satisfies IdaInvitationStatus[],
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

IdaInvitationSchema.index({ campaignId: 1, userId: 1 }, { unique: true });
IdaInvitationSchema.index({ userId: 1, status: 1, createdAt: -1 });

const IdaInvitation = models.IdaInvitation || model('IdaInvitation', IdaInvitationSchema);

export default IdaInvitation;
