import mongoose, { Schema, model, models } from 'mongoose';
import type { NotificationAudience, NotificationPriority, NotificationType } from '@/lib/notifications/types';

export interface IUserNotification {
    userId: mongoose.Types.ObjectId;
    type: NotificationType;
    title: string;
    body: string;
    priority: NotificationPriority;
    read: boolean;
    readAt?: Date | null;
    deepLink?: string;
    audience?: NotificationAudience;
    meta?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const UserNotificationSchema = new Schema<IUserNotification>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        type: { type: String, required: true, index: true },
        title: { type: String, required: true },
        body: { type: String, required: true },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'critical'],
            default: 'normal',
        },
        read: { type: Boolean, default: false, index: true },
        readAt: { type: Date, default: null },
        deepLink: { type: String, default: '' },
        audience: { type: String, enum: ['admin', 'citizen'], default: 'citizen' },
        meta: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
);

UserNotificationSchema.index({ userId: 1, createdAt: -1 });
UserNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
UserNotificationSchema.index(
    { userId: 1, 'meta.dedupeKey': 1 },
    { unique: true, sparse: true },
);

if (process.env.NODE_ENV !== 'production' && models.UserNotification) {
    delete models.UserNotification;
}

const UserNotification = models.UserNotification || model<IUserNotification>('UserNotification', UserNotificationSchema);

export default UserNotification;
