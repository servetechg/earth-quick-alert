import { Schema, model, models } from 'mongoose';

/**
 * Singleton cache for the AI-generated continuity-audit summary shown on the
 * admin emergency-plan page. The full inventory aggregate (counts, integrity
 * breakdown, etc.) plus the AI output are stored here so the panel can render
 * instantly on every page load without re-calling OpenAI. The cache is only
 * refreshed when plans or attachments change (create / update / upload / delete).
 */
const ContinuityAuditSchema = new Schema(
    {
        scope: { type: String, default: 'global', unique: true },
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
            inSync: { type: Number, default: 0 },
            reviewing: { type: Number, default: 0 },
            deviation: { type: Number, default: 0 },
            unanalyzed: { type: Number, default: 0 },
        },
        generatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

if (process.env.NODE_ENV !== 'production' && models.ContinuityAudit) {
    delete models.ContinuityAudit;
}

const ContinuityAudit = models.ContinuityAudit || model('ContinuityAudit', ContinuityAuditSchema);

export default ContinuityAudit;
