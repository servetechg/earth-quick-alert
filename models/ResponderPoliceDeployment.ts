import mongoose, { Schema, model, models } from 'mongoose';

const IncidentOpSchema = new Schema(
    {
        id: { type: String, required: true },
        incidentName: { type: String, required: true },
        teamsDeployed: { type: Number, required: true, min: 0 },
        operationSummary: { type: String, default: '' },
    },
    { _id: false },
);

const StagingAreaSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        address: { type: String, default: '' },
        units: { type: Number, required: true, min: 0 },
    },
    { _id: false },
);

const ResponderPoliceDeploymentSchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        agencyId: { type: String, required: true },
        agencyName: { type: String, default: '' },
        vehiclesDeployed: { type: Number, default: 0, min: 0 },
        personnelOnDuty: { type: Number, default: 0, min: 0 },
        incidentOperations: { type: [IncidentOpSchema], default: [] },
        stagingAreas: { type: [StagingAreaSchema], default: [] },
        commanderNotes: { type: String, default: '' },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderPoliceDeployment) {
    delete models.ResponderPoliceDeployment;
}

const ResponderPoliceDeployment =
    models.ResponderPoliceDeployment || model('ResponderPoliceDeployment', ResponderPoliceDeploymentSchema);

export default ResponderPoliceDeployment;
