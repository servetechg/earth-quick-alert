import mongoose, { Schema, model, models } from 'mongoose';

const SubAdminTaskSchema = new Schema(
    {
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
        sourceTaskId: {
            type: Schema.Types.ObjectId,
            ref: 'Task',
            default: null,
        },
        title: { type: String, required: true, trim: true },
        createdBy: {
            type: String,
            enum: ['super_admin', 'sub_admin'],
            required: true,
        },
        isDeletedBySubAdmin: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true, collection: 'subadmin_tasks' }
);

SubAdminTaskSchema.index({ subAdminId: 1, preparednessId: 1 });
SubAdminTaskSchema.index({ subAdminId: 1, sourceTaskId: 1 });

if (process.env.NODE_ENV !== 'production' && models.SubAdminTask) {
    delete models.SubAdminTask;
}

const SubAdminTask = models.SubAdminTask || model('SubAdminTask', SubAdminTaskSchema);

export default SubAdminTask;
