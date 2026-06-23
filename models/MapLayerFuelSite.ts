import mongoose, { Schema, model, models } from 'mongoose';

const MapLayerFuelSiteSchema = new Schema(
    {
        stationRecordId: { type: String, required: true, unique: true, index: true },
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
        fuelTypeCode: { type: String, default: '', index: true },
        accessCode: { type: String, default: '' },
        statusCode: { type: String, default: '' },
        facilityType: { type: String, default: '' },
        phone: { type: String, default: '' },
        accessHours: { type: String, default: '' },
        properties: { type: Schema.Types.Mixed, default: {} },
        ingestedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

MapLayerFuelSiteSchema.index({ location: '2dsphere' });
MapLayerFuelSiteSchema.index({ stateKey: 1, stationRecordId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerFuelSite) {
    delete models.MapLayerFuelSite;
}

const MapLayerFuelSite = models.MapLayerFuelSite || model('MapLayerFuelSite', MapLayerFuelSiteSchema);

export default MapLayerFuelSite;
