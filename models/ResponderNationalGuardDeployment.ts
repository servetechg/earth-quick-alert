import mongoose, { Schema, model, models } from 'mongoose';

const NationalGuardSiteSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        address: { type: String, default: '' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
        personnelDeployed: { type: Number, default: 0, min: 0 },
        vehiclesDeployed: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['active', 'limited', 'suspended'], required: true },
        notes: { type: String },
    },
    { _id: false },
);

const ResponderNationalGuardDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        networkId: { type: String, required: true },
        networkName: { type: String, default: '' },
        sites: { type: [NationalGuardSiteSchema], default: [] },
        coordinatorNotes: { type: String, default: '' },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderNationalGuardDeployment) {
    delete models.ResponderNationalGuardDeployment;
}

const ResponderNationalGuardDeployment =
    models.ResponderNationalGuardDeployment ||
    model('ResponderNationalGuardDeployment', ResponderNationalGuardDeploymentSchema);

export default ResponderNationalGuardDeployment;
