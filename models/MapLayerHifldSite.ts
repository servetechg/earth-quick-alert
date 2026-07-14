import mongoose, { Schema, model, models } from 'mongoose';

const MapLayerHifldSiteSchema = new Schema(
    {
        facilityId: { type: String, required: true, index: true },
        sectorId: { type: String, required: true, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        city: { type: String, default: '' },
        address: { type: String, default: '' },
        zip: { type: String, default: '' },
        status: { type: String, default: '' },
        datasetSlug: { type: String, default: '' },
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

MapLayerHifldSiteSchema.index({ location: '2dsphere' });
MapLayerHifldSiteSchema.index({ sectorId: 1, facilityId: 1 }, { unique: true });
MapLayerHifldSiteSchema.index({ sectorId: 1, stateKey: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerHifldSite) {
    delete models.MapLayerHifldSite;
}

const MapLayerHifldSite =
    models.MapLayerHifldSite || model('MapLayerHifldSite', MapLayerHifldSiteSchema);

export default MapLayerHifldSite;
