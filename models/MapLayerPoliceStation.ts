import { Schema, model, models } from 'mongoose';

const MapLayerPoliceStationSchema = new Schema(
    {
        placeId: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        stateKey: { type: String, required: true, index: true },
        state: { type: String, default: '' },
        address: { type: String, default: '' },
        phone: { type: String, default: '' },
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

MapLayerPoliceStationSchema.index({ location: '2dsphere' });
MapLayerPoliceStationSchema.index({ stateKey: 1, placeId: 1 });

if (process.env.NODE_ENV !== 'production' && models.MapLayerPoliceStation) {
    delete models.MapLayerPoliceStation;
}

const MapLayerPoliceStation =
    models.MapLayerPoliceStation || model('MapLayerPoliceStation', MapLayerPoliceStationSchema);

export default MapLayerPoliceStation;
