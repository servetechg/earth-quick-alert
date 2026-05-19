import mongoose, { Schema, model, models } from 'mongoose';

const FederalStagingAreaSchema = new Schema(
    {
        id: { type: String, required: true },
        location: { type: String, required: true },
        personnelCount: { type: Number, required: true, min: 0 },
        vehicleCount: { type: Number, required: true, min: 0 },
        status: { type: String, enum: ['active', 'standby', 'demobilized'], required: true },
        notes: { type: String, default: '' },
    },
    { _id: false },
);

const ResponderFederalDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        jurisdictionName: { type: String, default: '' },
        totalPersonnelDeployed: { type: Number, default: 0, min: 0 },
        stagingAreas: { type: [FederalStagingAreaSchema], default: [] },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderFederalDeployment) {
    delete models.ResponderFederalDeployment;
}

const ResponderFederalDeployment =
    models.ResponderFederalDeployment || model('ResponderFederalDeployment', ResponderFederalDeploymentSchema);

export default ResponderFederalDeployment;
