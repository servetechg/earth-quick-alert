import mongoose, { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Please provide a name'],
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 6,
        select: false, // Don't return password by default
    },
    role: {
        type: String,
        enum: ['super-admin', 'sub-admin', 'admin', 'observer', 'responder', 'manager', 'user', 'eoc-manager', 'eoc-observer'],
        default: 'user',
    },
    licenseId: {
        type: Schema.Types.ObjectId,
        ref: 'License',
        default: null, // Null means public user or super-admin unattached to EOC
    },
    accountStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'approved',
    },
    isSafe: {
        type: Boolean,
        default: true,
    },
    location: {
        type: String,
        default: '',
    },
    lastLocationUpdate: {
        type: Date,
        default: Date.now,
    },
    familyMembers: [{
        name: String,
        relationship: String,
        location: String,
        status: {
            type: String,
            enum: ['SAFE', 'DANGER', 'PENDING', 'true', 'false'],
            default: 'true',
        },
        statusReason: {
            type: String,
            default: '',
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
        }
    }],
    emergencyContacts: [{
        name: String,
        phone: String,
        relation: String,
    }],
    supplyKit: [{
        item: String,
        checked: { type: Boolean, default: false },
    }],
    meetingPoints: [{
        name: String,
        address: String,
        description: String,
        isPrimary: { type: Boolean, default: false },
    }],
    preparednessChecklist: [{
        task: String,
        completed: { type: Boolean, default: false },
    }],
    favoritePlaces: [{
        name: String,
        address: String,
        coordinates: {
            lat: Number,
            lng: Number,
        },
        icon: { type: String, default: 'MapPin' },
        createdAt: { type: Date, default: Date.now },
    }],
    phoneNumber: {
        type: String,
        default: '',
    },
    profilePic: {
        type: String,
        default: '',
    },
    notificationPreferences: {
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        majorAlerts: { type: Boolean, default: true },
        minorAlerts: { type: Boolean, default: true },
        aiReports: { type: Boolean, default: true },
    },
    country: {
        type: String,
        default: '',
    },
    state: {
        type: String,
        default: '',
    },
    city: {
        type: String,
        default: '',
    },
    zipcode: {
        type: String,
        default: '',
    },
    requestedLicense: {
        type: Boolean,
        default: false,
    },
    requestedOrgName: {
        type: String,
        default: '',
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    responderFunction: {
        type: String,
        default: '',
    },
    lat: {
        type: Number,
        default: null,
    },
    lng: {
        type: Number,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Clear Mongoose models in development to apply schema changes
if (process.env.NODE_ENV !== 'production' && models.User) {
    delete models.User;
}
const User = models.User || model('User', UserSchema);

export default User;
