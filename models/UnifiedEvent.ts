import { Schema, model, models } from 'mongoose';

const UnifiedEventSchema = new Schema(
    {
        externalId: { type: String, required: true, unique: true, index: true },
        source: {
            type: String,
            enum: [
                'nws',
                'usgs',
                'earthquake',
                'nwps',
                'fema',
                'nasa_firms',
                'inciweb',
                'noaa_nwis',
                'noaa_ncei',
                'manual',
                'seed',
            ],
            required: true,
            index: true,
        },
        category: {
            type: String,
            enum: [
                'flood',
                'earthquake',
                'wildfire',
                'storm',
                'marine',
                'coastal_surf',
                'hazardous',
                'hurricane_typhoon',
                'tsunami',
                'volcanic',
                'landslide',
                'winter_weather',
                'air_quality',
                'extreme_heat',
                'fema_declaration',
            ],
            required: true,
            index: true,
        },
        name: { type: String, required: true },
        description: { type: String, default: '' },
        severity: {
            type: String,
            enum: ['Low', 'Moderate', 'High', 'Extreme'],
            default: 'Moderate',
        },
        type: {
            type: String,
            enum: ['Warning', 'Watch', 'Advisory', 'Statement', 'Declaration'],
            default: 'Warning',
        },
        iconType: {
            type: String,
            enum: ['cloud', 'triangle', 'lightning', 'flame', 'wave', 'snowflake', 'wind'],
            default: 'triangle',
        },
        /** End-user action prompt (distinct from data freshness). */
        status: {
            type: String,
            enum: ['Take Action', 'Get Prepared', 'Monitor', 'Info'],
            default: 'Take Action',
        },
        dataStatus: {
            type: String,
            enum: ['current', 'past'],
            default: 'current',
            index: true,
        },
        location: { type: String, required: true },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        coordinates: {
            type: {
                lat: Number,
                lng: Number,
            },
            default: null,
        },
        geometry: { type: Schema.Types.Mixed, default: null },
        issuedAt: { type: String, required: true },
        expiresAt: { type: String, required: true },
        instructions: [{ type: String }],
        /** Category-specific measurements; only `properties[category]` is populated. */
        properties: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
);

UnifiedEventSchema.index({ source: 1, dataStatus: 1, updatedAt: -1 });

if (process.env.NODE_ENV !== 'production' && models.UnifiedEvent) {
    delete models.UnifiedEvent;
}

const UnifiedEvent = models.UnifiedEvent || model('UnifiedEvent', UnifiedEventSchema);

export default UnifiedEvent;
