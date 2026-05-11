import mongoose, { Schema, model, models } from 'mongoose';

const EmergencyPlanSchema = new Schema({
    planId: { type: String, required: true, unique: true }, // e.g., 'hurricane_warning'
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
    }],
}, {
    timestamps: true,
});

if (process.env.NODE_ENV !== 'production' && models.EmergencyPlan) {
    delete models.EmergencyPlan;
}

const EmergencyPlan = models.EmergencyPlan || model('EmergencyPlan', EmergencyPlanSchema);

export default EmergencyPlan;
