import mongoose, { Schema, model, models } from 'mongoose';

/**
 * Tenant-aware successor to `EmergencyPlan`.
 *
 * Every document is owned by the uploading subadmin (`ownerUserId`), which is the
 * source of the Weaviate / Python tenant key (`tenantKey = "sub_" + ownerUserId`).
 * `planId` is unique *within* an owner's vault (compound index below) — never global —
 * so two subadmins can each hold a plan with the same slug without their data ever
 * merging. The legacy `EmergencyPlan` collection is left untouched and is retired only
 * once this collection is fully exercised in production.
 *
 * The attachment subdocument (including the four `aiIntegrity*` fields) and the
 * `coop|bcp|compliance` category enum are intentionally byte-for-byte identical to the
 * legacy schema so the UI and Python integrity contract require no changes.
 */
const ContinuityPlanSchema = new Schema({
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Informational only (super-admin roll-ups / billing) — NOT an isolation key.
    licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null, index: true },
    planId: { type: String, required: true }, // unique per owner — enforced by compound index below
    label: { type: String, required: true },
    overview: { type: String, required: true },
    /**
     * Continuity-vault bucket for the admin dashboard counts:
     *  - 'coop':       Continuity of Operations (succession, vital records, essential functions, hazard playbooks…)
     *  - 'bcp':        Business Continuity Plan (IT/telecom, supply chain, facilities…)
     *  - 'compliance': regulatory, audit, NIMS/ICS, policy artifacts
     */
    category: { type: String, enum: ['coop', 'bcp', 'compliance'] },
    steps: [{ type: String }],
    attachments: [{
        fileName: { type: String, required: true },
        fileUrl: { type: String, required: true },
        size: { type: Number },
        uploadedAt: { type: Date, default: Date.now },
        cloudinaryPublicId: { type: String },
        cloudinaryResourceType: { type: String, enum: ['image', 'raw'] },
        aiIntegrityStatus: { type: String },
        aiIntegrityScore: { type: Number },
        aiIntegritySummary: { type: String },
        aiIntegrityAnalyzedAt: { type: Date },
        // Per-signal 0–100 breakdown from the AI service (content 50% / name 19% / quality 19% / duplication 12%).
        aiIntegrityComponents: {
            content: { type: Number },
            name: { type: Number },
            quality: { type: Number },
            duplication: { type: Number },
        },
    }],
}, {
    timestamps: true,
});

// planId is unique within a subadmin's vault — two subadmins can each own the same slug.
ContinuityPlanSchema.index({ ownerUserId: 1, planId: 1 }, { unique: true });

if (process.env.NODE_ENV !== 'production' && models.ContinuityPlan) {
    delete models.ContinuityPlan;
}

const ContinuityPlan = models.ContinuityPlan || model('ContinuityPlan', ContinuityPlanSchema);

export default ContinuityPlan;
