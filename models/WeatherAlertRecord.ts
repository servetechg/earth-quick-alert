import mongoose, { Schema, model, models } from 'mongoose';

const WeatherAlertRecordSchema = new Schema({
    alertId: { type: String, required: true },
    source: { type: String, required: true },
    event: { type: String },
    severity: { type: String },
    title: { type: String },
    description: { type: String },
    timestamp: { type: Date },
    expiresAt: { type: Date },
    weatherType: { type: String },
    temperature: { type: Number },
    windSpeed: { type: Number },
    humidity: { type: Number },
    precipitation: { type: Number },
    coordinates: {
        lat: { type: Number },
        lon: { type: Number },
    },
    affectedAreas: [{ type: String }],
    areaDesc: { type: String },
    zones: [{ type: String }],
}, {
    timestamps: true,
});

WeatherAlertRecordSchema.index({ alertId: 1 }, { unique: true });
WeatherAlertRecordSchema.index({ source: 1, expiresAt: 1, timestamp: -1 });
WeatherAlertRecordSchema.index({ event: 1 });

if (process.env.NODE_ENV !== 'production' && (models as any).WeatherAlertRecord) {
    delete (models as any).WeatherAlertRecord;
}

const WeatherAlertRecord = models.WeatherAlertRecord || model('WeatherAlertRecord', WeatherAlertRecordSchema);

export default WeatherAlertRecord;
