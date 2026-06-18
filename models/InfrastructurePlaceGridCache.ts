import mongoose, { Schema, model, models } from 'mongoose';

export type CachedInfrastructurePlace = {
    place_id: string;
    name: string;
    placeType: string;
    lat: number;
    lng: number;
    vicinity: string;
    rating?: number;
    user_ratings_total?: number;
    googleTypes?: string[];
};

const CachedPlaceSchema = new Schema(
    {
        place_id: { type: String, required: true },
        name: { type: String, required: true },
        placeType: { type: String, required: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        vicinity: { type: String, default: 'Address not available' },
        rating: { type: Number },
        user_ratings_total: { type: Number },
        googleTypes: { type: [String] },
    },
    { _id: false },
);

const InfrastructurePlaceGridCacheSchema = new Schema(
    {
        /** `state:AR` or `radius:36.123,-94.456:25` */
        scopeKey: { type: String, required: true, index: true },
        placeType: { type: String, required: true, index: true },
        /** Grid center latitude (rounded for stable keys). */
        gridLat: { type: Number, required: true },
        /** Grid center longitude (rounded for stable keys). */
        gridLng: { type: Number, required: true },
        places: { type: [CachedPlaceSchema], default: [] },
        expiresAt: { type: Date, required: true, index: true },
    },
    { timestamps: true },
);

InfrastructurePlaceGridCacheSchema.index(
    { scopeKey: 1, placeType: 1, gridLat: 1, gridLng: 1 },
    { unique: true },
);

if (process.env.NODE_ENV !== 'production' && models.InfrastructurePlaceGridCache) {
    delete models.InfrastructurePlaceGridCache;
}

const InfrastructurePlaceGridCache =
    models.InfrastructurePlaceGridCache ||
    model('InfrastructurePlaceGridCache', InfrastructurePlaceGridCacheSchema);

export default InfrastructurePlaceGridCache;
