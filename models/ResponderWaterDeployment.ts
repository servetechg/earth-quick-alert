import mongoose, { Schema, model, models } from 'mongoose';

const WaterSiteSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        address: { type: String, default: '' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 },
        crewsDeployed: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['active', 'limited', 'suspended'], required: true },
        notes: { type: String },
    },
    { _id: false },
);

const ResponderWaterDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        networkId: { type: String, required: true },
        networkName: { type: String, default: '' },
        sites: { type: [WaterSiteSchema], default: [] },
        coordinatorNotes: { type: String, default: '' },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderWaterDeployment) {
    delete models.ResponderWaterDeployment;
}

const ResponderWaterDeployment =
    models.ResponderWaterDeployment || model('ResponderWaterDeployment', ResponderWaterDeploymentSchema);

export default ResponderWaterDeployment;
