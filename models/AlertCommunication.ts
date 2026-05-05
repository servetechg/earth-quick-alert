import mongoose, { Schema, model, models } from 'mongoose';

const AlertCommunicationSchema = new Schema({
    name: { type: String, required: true },
    type: { type: String, required: true }, // Watch or Warning
    iconType: { type: String, required: true }, // triangle, lightning, cloud
    location: { type: String, required: true },
    issuedAt: { type: String, required: true }, // e.g., "12 min ago"
    expiresAt: { type: String, required: true }, // e.g., "3:45 PM"
    status: { type: String, required: true }, // "Take Action" or "Get Prepared"
    description: { type: String },
    instructions: [{ type: String }],
    preparednessTip: { type: String },
    severity: { type: String, default: 'Moderate' },
    /** Upstream feed identifier — `nws` (api.weather.gov), `usgs` (waterservices), `firms` (NASA FIRMS), `inciweb` (NWCG RSS), `manual`, or `seed`. */
    source: {
        type: String,
        enum: ['nws', 'manual', 'seed', 'usgs', 'firms', 'inciweb', 'nwps', 'fema'],
        default: 'manual',
    },
    externalId: { type: String, sparse: true, index: true },
}, {
    timestamps: true,
});

AlertCommunicationSchema.index({ source: 1, externalId: 1 });

if (process.env.NODE_ENV !== 'production' && models.AlertCommunication) {
    delete models.AlertCommunication;
}

const AlertCommunication = models.AlertCommunication || model('AlertCommunication', AlertCommunicationSchema);

export default AlertCommunication;
