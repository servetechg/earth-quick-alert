import mongoose, { Schema, model, models } from 'mongoose';

const DispatchSettingsSchema = new Schema(
    {
        autoDispatchMajor: {
            type: Boolean,
            default: true,
        },
        autoEscalateMinutes: {
            type: Number,
            default: 15,
            min: 1,
            max: 240,
        },
        defaultChannel: {
            type: String,
            enum: ['all', 'sms', 'email', 'push'],
            default: 'all',
        },
        region: {
            type: String,
            enum: ['western', 'central', 'eastern', 'national'],
            default: 'western',
        },
        messageTemplate: {
            type: String,
            default:
                'EMERGENCY ALERT: {severity} {type} reported in {location}. {instructions} - Ready2Go Emergency Services.',
            maxlength: 1200,
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

if (process.env.NODE_ENV !== 'production' && models.DispatchSettings) {
    delete models.DispatchSettings;
}

const DispatchSettings = models.DispatchSettings || model('DispatchSettings', DispatchSettingsSchema);

export default DispatchSettings;

