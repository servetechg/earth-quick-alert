import mongoose, { Schema, model, models } from 'mongoose';

const PharmacySiteSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        address: { type: String, default: '' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
        status: { type: String, enum: ['open', 'limited', 'closed'], required: true },
        notes: { type: String },
    },
    { _id: false },
);

const ResponderPharmacyDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        networkId: { type: String, required: true },
        networkName: { type: String, default: '' },
        sites: { type: [PharmacySiteSchema], default: [] },
        coordinatorNotes: { type: String, default: '' },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderPharmacyDeployment) {
    delete models.ResponderPharmacyDeployment;
}

const ResponderPharmacyDeployment =
    models.ResponderPharmacyDeployment || model('ResponderPharmacyDeployment', ResponderPharmacyDeploymentSchema);

export default ResponderPharmacyDeployment;
