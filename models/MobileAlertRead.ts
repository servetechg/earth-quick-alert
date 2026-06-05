import { Schema, model, models, Types } from 'mongoose';

const MobileAlertReadSchema = new Schema(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        alertId: { type: String, required: true, trim: true },
        read: { type: Boolean, default: true },
        readAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

MobileAlertReadSchema.index({ userId: 1, alertId: 1 }, { unique: true });

const MobileAlertRead =
    models.MobileAlertRead || model('MobileAlertRead', MobileAlertReadSchema);

export default MobileAlertRead;

export type MobileAlertReadLean = {
    userId: Types.ObjectId;
    alertId: string;
    read: boolean;
    readAt: Date;
};
