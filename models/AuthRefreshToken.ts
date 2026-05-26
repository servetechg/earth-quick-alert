import crypto from 'crypto';
import { Schema, model, models, Types } from 'mongoose';

const AuthRefreshTokenSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true, index: true },
        revokedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

const AuthRefreshToken = models.AuthRefreshToken || model('AuthRefreshToken', AuthRefreshTokenSchema);
export default AuthRefreshToken;

export function hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export type RefreshTokenLean = {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
};
