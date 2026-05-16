import mongoose, { Schema, model, models } from 'mongoose';

const TransitSiteSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        address: { type: String, default: '' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
        vehiclesDeployed: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['active', 'limited', 'suspended'], required: true },
        notes: { type: String },
    },
    { _id: false },
);

const ResponderTransitDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        networkId: { type: String, required: true },
        networkName: { type: String, default: '' },
        sites: { type: [TransitSiteSchema], default: [] },
        coordinatorNotes: { type: String, default: '' },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderTransitDeployment) {
    delete models.ResponderTransitDeployment;
}

const ResponderTransitDeployment =
    models.ResponderTransitDeployment || model('ResponderTransitDeployment', ResponderTransitDeploymentSchema);

export default ResponderTransitDeployment;
