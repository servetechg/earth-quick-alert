import mongoose, { Schema, model, models } from 'mongoose';

const EmailSuppressionSchema = new Schema(
    {
        email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
        reason: { type: String, default: 'bounce' },
        source: { type: String, default: 'resend' },
    },
    { timestamps: true },
);

if (process.env.NODE_ENV !== 'production' && models.EmailSuppression) {
    delete models.EmailSuppression;
}

const EmailSuppression =
    models.EmailSuppression || model('EmailSuppression', EmailSuppressionSchema);

export default EmailSuppression;
