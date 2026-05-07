import mongoose, { Schema, model, models } from 'mongoose';

const UserTaskSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        subAdminId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        preparednessId: {
            type: Schema.Types.ObjectId,
            ref: 'PreparednessGuide',
            required: true,
        },
        taskId: {
            type: Schema.Types.ObjectId,
            ref: 'SubAdminTask',
            required: true,
        },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        sentAt: { type: Date, default: Date.now },
    },
    { timestamps: false, collection: 'user_tasks' }
);

UserTaskSchema.index({ userId: 1 });
UserTaskSchema.index({ userId: 1, taskId: 1 }, { unique: true });

if (process.env.NODE_ENV !== 'production' && models.UserTask) {
    delete models.UserTask;
}

const UserTask = models.UserTask || model('UserTask', UserTaskSchema);

export default UserTask;
