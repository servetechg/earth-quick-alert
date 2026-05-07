import mongoose, { Schema, model, models } from 'mongoose';

const TaskSchema = new Schema(
    {
        preparednessId: {
            type: Schema.Types.ObjectId,
            ref: 'PreparednessGuide',
            required: true,
            index: true,
        },
        title: { type: String, required: true, trim: true },
        createdBy: {
            type: String,
            enum: ['super_admin'],
            default: 'super_admin',
        },
        createdByUserId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

TaskSchema.index({ preparednessId: 1, isActive: 1 });

if (process.env.NODE_ENV !== 'production' && models.Task) {
    delete models.Task;
}

const Task = models.Task || model('Task', TaskSchema);

export default Task;
