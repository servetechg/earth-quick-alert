import mongoose, { Schema, model, models } from 'mongoose';

const MapLayerDamSchema = new Schema(
    {
        federalId: { type: String, required: true, unique: true, index: true },
        nidId: { type: String, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        county: { type: String, default: '' },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true },
        },
        publicHazardId: { type: String, default: '' },
        conditionAssessId: { type: String, default: '' },
        maxStorage: { type: Number, default: null },
        damHeight: { type: Number, default: null },
        dataUpdated: { type: String, default: '' },
        properties: { type: Schema.Types.Mixed, default: {} },
        ingestedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

MapLayerDamSchema.index({ location: '2dsphere' });
MapLayerDamSchema.index({ stateKey: 1, federalId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerDam) {
    delete models.MapLayerDam;
}

const MapLayerDam = models.MapLayerDam || model('MapLayerDam', MapLayerDamSchema);

export default MapLayerDam;
