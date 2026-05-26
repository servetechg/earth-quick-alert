import { Schema, model, models } from 'mongoose';
import type { OtpPurpose } from '@/lib/types/mobile/auth';

const AuthOtpSchema = new Schema(
    {
        email: { type: String, required: true, lowercase: true, index: true },
        purpose: {
            type: String,
            enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET'],
            required: true,
        },
        codeHash: { type: String, required: true },
        expiresAt: { type: Date, required: true, index: true },
        attempts: { type: Number, default: 0 },
        lockedUntil: { type: Date, default: null },
        lastSentAt: { type: Date, default: Date.now },
        sendCountInWindow: { type: Number, default: 0 },
        rateWindowStart: { type: Date, default: null },
    },
    { timestamps: true },
);

AuthOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });

export type AuthOtpDoc = {
    email: string;
    purpose: OtpPurpose;
    codeHash: string;
    expiresAt: Date;
    attempts: number;
    lockedUntil: Date | null;
    lastSentAt: Date;
};

const AuthOtp = models.AuthOtp || model('AuthOtp', AuthOtpSchema);
export default AuthOtp;
