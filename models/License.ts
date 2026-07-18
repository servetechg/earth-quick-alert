import mongoose, { Schema, model, models } from 'mongoose';

const LicenseSchema = new Schema({
    organizationName: {
        type: String,
        required: [true, 'Please provide an organization name'],
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'suspended', 'expired'],
        default: 'active',
    },
    geographicBoundaries: {
        type: {
            type: String,
            enum: ['Polygon', 'MultiPolygon'],
        },
        coordinates: {
            type: Schema.Types.Mixed, // Relaxing typing since GeoJSON borders can get complex [ [[lng, lat], ...] ]
        }
    },
    subscriptionDetails: {
        planType: {
            type: String,
            default: 'Enterprise',
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
        }
    },
    assignedSubAdminId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    billingContact: {
        type: String,
    },
    billingAddress: {
        type: String,
    },
    billingEmail: {
        type: String,
    },
    phoneNumber: {
        type: String,
    },
    radiusMile: {
        type: Number,
        default: 5,
    },
    coverageType: {
        type: String,
        enum: ['state', 'radius', 'county'],
        default: 'radius',
    },
    /** County name when coverageType is `county` (e.g. "Desha"). */
    coverageCounty: {
        type: String,
        default: '',
        trim: true,
    },
}, {
    timestamps: true,
});

// Clear Mongoose models in development to apply schema changes
if (process.env.NODE_ENV !== 'production' && models.License) {
    delete models.License;
}

const License = models.License || model('License', LicenseSchema);

export default License;
