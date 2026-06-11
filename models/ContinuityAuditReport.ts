import mongoose, { Schema, model, models } from 'mongoose';

/**
 * Tenant-aware successor to `ContinuityAudit`.
 *
 * The legacy `ContinuityAudit` was a single global singleton (`scope:'global'`) blending
 * every subadmin's vault into one audit. This collection keys the audit by `ownerUserId`
 * so there is exactly **one cached audit per subadmin**, scanning only that subadmin's
 * plans. The legacy collection is left untouched until this path is fully proven.
 *
 * The output shape (`summary, findings, posture, averageScore, totals, integrity,
 * generatedAt`) is identical to the legacy schema — only the key changes from `scope` to
 * `ownerUserId` — so the admin emergency-plan page renders it without any change.
 */
const ContinuityAuditReportSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        summary: { type: String, default: '' },
        findings: [{ type: String }],
        posture: { type: String, enum: ['Resilient', 'Steady', 'At Risk'], default: 'At Risk' },
        averageScore: { type: Number, default: 0 },
        totals: {
            plans: { type: Number, default: 0 },
            attachments: { type: Number, default: 0 },
            analyzed: { type: Number, default: 0 },
        },
        integrity: {
            compliant: { type: Number, default: 0 },
            underReview: { type: Number, default: 0 },
            nonCompliant: { type: Number, default: 0 },
            unanalyzed: { type: Number, default: 0 },
        },
        generatedAt: { type: Date, default: Date.now },
        degraded: { type: Boolean, default: false },
    },
    { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && models.ContinuityAuditReport) {
    delete models.ContinuityAuditReport;
}

const ContinuityAuditReport =
    models.ContinuityAuditReport || model('ContinuityAuditReport', ContinuityAuditReportSchema);

export default ContinuityAuditReport;
