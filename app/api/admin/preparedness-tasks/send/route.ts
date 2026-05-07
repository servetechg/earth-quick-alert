import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import PreparednessGuide from '@/models/PreparednessGuide';
import TaskModel from '@/models/Task';
import SubAdminTask from '@/models/SubAdminTask';
import User from '@/models/User';
import { requireSuperAdmin } from '@/lib/preparedness-tasks/auth';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

type TaskDoc = { _id: mongoose.Types.ObjectId; preparednessId: mongoose.Types.ObjectId; title: string };

export async function POST(req: NextRequest) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        const subAdminIdsRaw = body?.subAdminIds;

        const idSet = new Set<string>();
        if (isValidObjectId(body?.taskId)) idSet.add(body.taskId as string);
        if (Array.isArray(body?.taskIds)) {
            for (const id of body.taskIds) if (isValidObjectId(id)) idSet.add(id as string);
        }
        if (idSet.size === 0) return jsonError('Provide taskId and/or taskIds[]', 400);

        const taskIds = [...idSet];

        await connectDB();

        const sourceTasksRaw = await TaskModel.find({
            _id: { $in: taskIds.map((id) => new mongoose.Types.ObjectId(id)) },
            isActive: true,
        }).lean();

        if (sourceTasksRaw.length !== taskIds.length) {
            const found = new Set(sourceTasksRaw.map((t) => String((t as { _id: unknown })._id)));
            const missing = taskIds.filter((id) => !found.has(id));
            return jsonError(`Task(s) not found or inactive: ${missing.join(', ')}`, 404);
        }

        const sourceTasks = sourceTasksRaw as unknown as TaskDoc[];
        const prepIdStrings = [...new Set(sourceTasks.map((t) => t.preparednessId.toString()))];
        const prepCount = await PreparednessGuide.countDocuments({
            _id: { $in: prepIdStrings.map((id) => new mongoose.Types.ObjectId(id)) },
        });
        if (prepCount !== prepIdStrings.length) return jsonError('One or more preparedness guides not found', 404);

        let subAdmins;
        const listMissingOrEmpty =
            subAdminIdsRaw === undefined ||
            subAdminIdsRaw === null ||
            (Array.isArray(subAdminIdsRaw) && subAdminIdsRaw.length === 0);

        if (listMissingOrEmpty) {
            subAdmins = await User.find({ role: 'sub-admin' }).select('_id').lean();
        } else {
            if (!Array.isArray(subAdminIdsRaw)) return jsonError('subAdminIds must be an array when provided', 400);
            const subAdminIds = [...new Set(subAdminIdsRaw.filter((id: unknown) => isValidObjectId(id)))];
            if (subAdminIds.length === 0) return jsonError('No valid ids in subAdminIds', 400);
            subAdmins = await User.find({
                _id: { $in: subAdminIds.map((id) => new mongoose.Types.ObjectId(id)) },
                role: 'sub-admin',
            })
                .select('_id')
                .lean();
            if (subAdmins.length !== subAdminIds.length) {
                return jsonError('One or more users are not sub-admins or do not exist', 400);
            }
        }

        const tasksOut: { taskId: string; recipients: { subAdminId: string; upserted: boolean }[] }[] = [];

        for (const sourceTaskDoc of sourceTasks) {
            const recipients: { subAdminId: string; upserted: boolean }[] = [];
            for (const sa of subAdmins) {
                const subAdminId = sa._id as mongoose.Types.ObjectId;
                const filter = { subAdminId, sourceTaskId: sourceTaskDoc._id };
                const existing = await SubAdminTask.findOne(filter).lean();
                await SubAdminTask.findOneAndUpdate(
                    filter,
                    {
                        $set: {
                            preparednessId: sourceTaskDoc.preparednessId,
                            title: sourceTaskDoc.title,
                            createdBy: 'super_admin',
                            isActive: true,
                            isDeletedBySubAdmin: false,
                        },
                    },
                    { upsert: true, new: true }
                );
                recipients.push({ subAdminId: subAdminId.toString(), upserted: !existing });
            }
            tasksOut.push({ taskId: sourceTaskDoc._id.toString(), recipients });
        }

        return NextResponse.json({ success: true, data: { tasks: tasksOut } });
    } catch (e) {
        console.error('POST /api/admin/preparedness-tasks/send:', e);
        return jsonError('Internal Server Error', 500);
    }
}

