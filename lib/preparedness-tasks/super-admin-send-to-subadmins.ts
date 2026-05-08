import type { AnyBulkWriteOperation } from 'mongodb';
import mongoose from 'mongoose';
import SubAdminTask from '@/models/SubAdminTask';

export type SuperAdminSourceTask = {
    _id: mongoose.Types.ObjectId;
    preparednessId: mongoose.Types.ObjectId;
    title: string;
};

type SubAdminLean = { _id: mongoose.Types.ObjectId };

const BULK_CHUNK = 800;

function pairKey(subAdminId: string, sourceTaskId: string) {
    return `${subAdminId}\0${sourceTaskId}`;
}

export type SuperAdminSendRecipient = { subAdminId: string; upserted: boolean };

export type SuperAdminSendTaskResult = {
    taskId: string;
    recipients: SuperAdminSendRecipient[];
};

/**
 * Fan-out super-admin Task rows to SubAdminTask with minimal round-trips (bulk upsert),
 * preserving the same response shape as the legacy per-pair findOne + findOneAndUpdate loop.
 */
export async function upsertSubAdminTasksFromSuperAdminTasks(
    sourceTasks: SuperAdminSourceTask[],
    subAdmins: SubAdminLean[]
): Promise<SuperAdminSendTaskResult[]> {
    if (sourceTasks.length === 0) return [];
    if (subAdmins.length === 0) {
        return sourceTasks.map((t) => ({ taskId: t._id.toString(), recipients: [] }));
    }

    const taskOids = sourceTasks.map((t) => t._id);
    const subAdminOids = subAdmins.map((sa) => sa._id);

    const existingRows = await SubAdminTask.find({
        sourceTaskId: { $in: taskOids },
        subAdminId: { $in: subAdminOids },
    })
        .select('subAdminId sourceTaskId')
        .lean();

    const existingSet = new Set(
        existingRows.map((r) => {
            const row = r as { subAdminId: mongoose.Types.ObjectId; sourceTaskId: mongoose.Types.ObjectId };
            return pairKey(row.subAdminId.toString(), row.sourceTaskId.toString());
        })
    );

    const bulkOps: AnyBulkWriteOperation[] = [];
    for (const sourceTaskDoc of sourceTasks) {
        for (const sa of subAdmins) {
            const subAdminId = sa._id;
            bulkOps.push({
                updateOne: {
                    filter: { subAdminId, sourceTaskId: sourceTaskDoc._id },
                    update: {
                        $set: {
                            preparednessId: sourceTaskDoc.preparednessId,
                            title: sourceTaskDoc.title,
                            createdBy: 'super_admin',
                            isActive: true,
                            isDeletedBySubAdmin: false,
                        },
                    },
                    upsert: true,
                },
            });
        }
    }

    for (let i = 0; i < bulkOps.length; i += BULK_CHUNK) {
        const slice = bulkOps.slice(i, i + BULK_CHUNK);
        if (slice.length > 0) {
            await SubAdminTask.bulkWrite(slice, { ordered: false });
        }
    }

    const tasksOut: SuperAdminSendTaskResult[] = [];
    for (const sourceTaskDoc of sourceTasks) {
        const tid = sourceTaskDoc._id.toString();
        const recipients: SuperAdminSendRecipient[] = [];
        for (const sa of subAdmins) {
            const sid = sa._id.toString();
            recipients.push({
                subAdminId: sid,
                upserted: !existingSet.has(pairKey(sid, tid)),
            });
        }
        tasksOut.push({ taskId: tid, recipients });
    }

    return tasksOut;
}
