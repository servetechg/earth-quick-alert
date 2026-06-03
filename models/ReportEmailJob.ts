import mongoose, { Schema, model, models } from 'mongoose';

export type ReportEmailJobStatus = 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
export type ReportEmailRecipientStatus = 'pending' | 'sent' | 'failed';

const ReportEmailRecipientSchema = new Schema(
    {
        email: { type: String, required: true, lowercase: true, trim: true },
        name: { type: String, default: '' },
        role: { type: String, default: '' },
        status: {
            type: String,
            enum: ['pending', 'sent', 'failed'] satisfies ReportEmailRecipientStatus[],
            default: 'pending',
        },
        error: { type: String, default: '' },
        messageId: { type: String, default: '' },
        sentAt: { type: Date, default: null },
    },
    { _id: false },
);

const ReportEmailJobSchema = new Schema(
    {
        status: {
            type: String,
            enum: ['queued', 'processing', 'completed', 'partial', 'failed'] satisfies ReportEmailJobStatus[],
            default: 'queued',
            index: true,
        },
        audience: { type: String, required: true },
        reportTitle: { type: String, required: true },
        summaryLine: { type: String, default: '' },
        filename: { type: String, required: true },
        pdfUrl: { type: String, required: true },
        pdfPublicId: { type: String, default: '' },
        sentByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        sentByEmail: { type: String, required: true, lowercase: true, trim: true },
        sentByName: { type: String, default: '' },
        provider: { type: String, default: 'resend' },
        recipients: { type: [ReportEmailRecipientSchema], default: [] },
        totalCount: { type: Number, default: 0 },
        sentCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        lastError: { type: String, default: '' },
    },
    { timestamps: true },
);

ReportEmailJobSchema.index({ status: 1, createdAt: 1 });

if (process.env.NODE_ENV !== 'production' && models.ReportEmailJob) {
    delete models.ReportEmailJob;
}

const ReportEmailJob = models.ReportEmailJob || model('ReportEmailJob', ReportEmailJobSchema);

export default ReportEmailJob;
