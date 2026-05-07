import mongoose, { Schema, model, models } from 'mongoose';

const PreparednessGuideSchema = new Schema(
    {
        category: { type: String, required: true, unique: true },
        order: { type: Number, default: 0 },
    },
    {
        timestamps: true,
    }
);

if (process.env.NODE_ENV !== 'production' && models.PreparednessGuide) {
    delete models.PreparednessGuide;
}

const PreparednessGuide = models.PreparednessGuide || model('PreparednessGuide', PreparednessGuideSchema);

export default PreparednessGuide;
