import crypto from 'crypto';
import { Schema, model, models } from 'mongoose';

const AuthPasswordResetSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        email: { type: String, required: true, lowercase: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true, index: true },
        usedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

const AuthPasswordReset = models.AuthPasswordReset || model('AuthPasswordReset', AuthPasswordResetSchema);
export default AuthPasswordReset;

export function hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}
