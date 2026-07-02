import { Schema, model, models } from 'mongoose';

const MapLayerVolunteerCenterSchema = new Schema(
    {
        placeId: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        address: { type: String, default: '' },
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

MapLayerVolunteerCenterSchema.index({ location: '2dsphere' });
MapLayerVolunteerCenterSchema.index({ stateKey: 1, placeId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerVolunteerCenter) {
    delete models.MapLayerVolunteerCenter;
}

const MapLayerVolunteerCenter =
    models.MapLayerVolunteerCenter || model('MapLayerVolunteerCenter', MapLayerVolunteerCenterSchema);

export default MapLayerVolunteerCenter;
