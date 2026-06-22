import mongoose, { Schema, model, models } from 'mongoose';

const MapLayerShelterSchema = new Schema(
    {
        shelterId: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        county: { type: String, default: '' },
        address: { type: String, default: '' },
        city: { type: String, default: '' },
        zip: { type: String, default: '' },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        location: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], required: true },
        },
        shelterStatusCode: { type: String, default: '' },
        facilityUsageCode: { type: String, default: '' },
        evacuationCapacity: { type: Number, default: null },
        postImpactCapacity: { type: Number, default: null },
        wheelchairAccessible: { type: String, default: '' },
        adaCompliant: { type: String, default: '' },
        organizationName: { type: String, default: '' },
        organizationPhone: { type: String, default: '' },
        properties: { type: Schema.Types.Mixed, default: {} },
        ingestedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

MapLayerShelterSchema.index({ location: '2dsphere' });
MapLayerShelterSchema.index({ stateKey: 1, shelterId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerShelter) {
    delete models.MapLayerShelter;
}

const MapLayerShelter = models.MapLayerShelter || model('MapLayerShelter', MapLayerShelterSchema);

export default MapLayerShelter;
