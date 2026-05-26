import { Schema, model, models, Types } from 'mongoose';

const RequirementSectionSchema = new Schema(
    {
        hasRequirement: { type: Boolean, required: true },
        selectedOptions: { type: [String], default: [] },
        otherDetails: { type: String, default: '' },
    },
    { _id: false },
);

const LodgingSectionSchema = new Schema(
    {
        selectedOptions: { type: [String], required: true },
        otherDetails: { type: String, default: '' },
    },
    { _id: false },
);

const AddressSchema = new Schema(
    {
        streetAddress: { type: String, required: true },
        aptUnit: { type: String, default: '' },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        useCurrentLocation: { type: Boolean, required: true },
    },
    { _id: false },
);

const UserProfileSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        address: { type: AddressSchema, required: true },
        householdSize: { type: Number, required: true, min: 1, max: 50 },
        ada: { type: RequirementSectionSchema, required: true },
        medical: { type: RequirementSectionSchema, required: true },
        pets: { type: RequirementSectionSchema, required: true },
        transport: { type: RequirementSectionSchema, required: true },
        lodging: { type: LodgingSectionSchema, required: true },
    },
    { timestamps: true },
);

const UserProfile = models.UserProfile || model('UserProfile', UserProfileSchema);
export default UserProfile;

export type UserProfileLean = {
    userId: Types.ObjectId;
    address: {
        streetAddress: string;
        aptUnit?: string;
        city: string;
        state: string;
        zipCode: string;
        useCurrentLocation: boolean;
    };
    householdSize: number;
    ada: { hasRequirement: boolean; selectedOptions: string[]; otherDetails?: string };
    medical: { hasRequirement: boolean; selectedOptions: string[]; otherDetails?: string };
    pets: { hasRequirement: boolean; selectedOptions: string[]; otherDetails?: string };
    transport: { hasRequirement: boolean; selectedOptions: string[]; otherDetails?: string };
    lodging: { selectedOptions: string[]; otherDetails?: string };
};
