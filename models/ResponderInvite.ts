import mongoose, { Schema, model, models } from 'mongoose';

const ResponderInviteSchema = new Schema(
    {
        email: { type: String, required: true, lowercase: true, trim: true, index: true },
        token: { type: String, required: true, unique: true, index: true },
        responderVertical: { type: String, required: true },
        responderFunction: { type: String, required: true },
        licenseId: { type: Schema.Types.ObjectId, ref: 'License', default: null },
        invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        expiresAt: { type: Date, required: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

ResponderInviteSchema.index({ email: 1, licenseId: 1, usedAt: 1 });

if (process.env.NODE_ENV !== 'production' && models.ResponderInvite) {
    delete models.ResponderInvite;
}

const ResponderInvite = models.ResponderInvite || model('ResponderInvite', ResponderInviteSchema);

export default ResponderInvite;
