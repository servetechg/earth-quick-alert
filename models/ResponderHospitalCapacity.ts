import mongoose, { Schema, model, models } from 'mongoose';

const HospitalUnitSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true },
        capacity: { type: Number, required: true, min: 0 },
        occupied: { type: Number, required: true, min: 0 },
        unitType: { type: String, enum: ['icu', 'medsurg', ''], default: '' },
    },
    { _id: false },
);

const ResponderHospitalCapacitySchema = new Schema(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        facilityId: { type: String, required: true },
        facilityName: { type: String, default: '' },
        notes: { type: String, default: '' },
        units: { type: [HospitalUnitSchema], default: [] },
        source: { type: String, enum: ['api', 'mock'], default: 'api' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.ResponderHospitalCapacity) {
    delete models.ResponderHospitalCapacity;
}

const ResponderHospitalCapacity =
    models.ResponderHospitalCapacity || model('ResponderHospitalCapacity', ResponderHospitalCapacitySchema);

export default ResponderHospitalCapacity;
