import mongoose, { Schema, model, models } from 'mongoose';

const MapLayerChemicalSiteSchema = new Schema(
    {
        registryId: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        county: { type: String, default: '' },
        city: { type: String, default: '' },
        address: { type: String, default: '' },
        zip: { type: String, default: '' },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true },
        },
        programAcronym: { type: String, default: 'SEMS', index: true },
        fipsCode: { type: String, default: '' },
        supplementalLocation: { type: String, default: '' },
        properties: { type: Schema.Types.Mixed, default: {} },
        ingestedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

MapLayerChemicalSiteSchema.index({ location: '2dsphere' });
MapLayerChemicalSiteSchema.index({ stateKey: 1, registryId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerChemicalSite) {
    delete models.MapLayerChemicalSite;
}

const MapLayerChemicalSite =
    models.MapLayerChemicalSite || model('MapLayerChemicalSite', MapLayerChemicalSiteSchema);

export default MapLayerChemicalSite;
