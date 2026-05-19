import mongoose, { Schema, model, models } from 'mongoose';

const NonprofitSiteSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        address: { type: String, default: '' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
        siteKind: { type: String, enum: ['network', 'shelter', 'volunteer'], required: true },
        volunteersDeployed: { type: Number, default: 0, min: 0 },
        shelterCapacity: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['active', 'limited', 'suspended'], required: true },
        notes: { type: String },
    },
    { _id: false },
);

const ResponderNonprofitDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        networkId: { type: String, required: true },
        networkName: { type: String, default: '' },
        sites: { type: [NonprofitSiteSchema], default: [] },
        coordinatorNotes: { type: String, default: '' },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderNonprofitDeployment) {
    delete models.ResponderNonprofitDeployment;
}

const ResponderNonprofitDeployment =
    models.ResponderNonprofitDeployment ||
    model('ResponderNonprofitDeployment', ResponderNonprofitDeploymentSchema);

export default ResponderNonprofitDeployment;
