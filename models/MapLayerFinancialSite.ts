import mongoose, { Schema, model, models } from 'mongoose';

const MapLayerFinancialSiteSchema = new Schema(
    {
        locationId: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        city: { type: String, default: '' },
        address: { type: String, default: '' },
        zip: { type: String, default: '' },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true },
        },
        properties: { type: Schema.Types.Mixed, default: {} },
        ingestedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

MapLayerFinancialSiteSchema.index({ location: '2dsphere' });
MapLayerFinancialSiteSchema.index({ stateKey: 1, locationId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerFinancialSite) {
    delete models.MapLayerFinancialSite;
}

const MapLayerFinancialSite =
    models.MapLayerFinancialSite || model('MapLayerFinancialSite', MapLayerFinancialSiteSchema);

export default MapLayerFinancialSite;
