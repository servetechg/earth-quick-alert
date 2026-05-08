import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import PreparednessGuide from '@/models/PreparednessGuide';
import TaskModel from '@/models/Task';
import SubAdminTask from '@/models/SubAdminTask';
import User from '@/models/User';
import UserTask from '@/models/UserTask';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

type AdminTaskDoc = { _id: mongoose.Types.ObjectId; preparednessId: mongoose.Types.ObjectId; title: string };

/** Lean `SubAdminTask` row used when sub-admin sends to users */
type SubAdminTaskSendDoc = {
    _id: mongoose.Types.ObjectId;
    preparednessId: mongoose.Types.ObjectId;
    title: string;
};

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return jsonError('Unauthorized', 401);

        const role = session.user.role;
        if (role !== 'super-admin' && role !== 'sub-admin') return jsonError('Forbidden', 403);

        const body = await req.json().catch(() => null);
        await connectDB();

        // super-admin: send Task(s) -> SubAdminTask(s)
        if (role === 'super-admin') {
            const subAdminIdsRaw = body?.subAdminIds;

            const idSet = new Set<string>();
            if (isValidObjectId(body?.taskId)) idSet.add(body.taskId as string);
            if (Array.isArray(body?.taskIds)) for (const id of body.taskIds) if (isValidObjectId(id)) idSet.add(id as string);
            if (idSet.size === 0) return jsonError('Provide taskId and/or taskIds[]', 400);
            const taskIds = [...idSet];

            const sourceTasksRaw = await TaskModel.find({
                _id: { $in: taskIds.map((id) => new mongoose.Types.ObjectId(id)) },
                isActive: true,
            }).lean();

            if (sourceTasksRaw.length !== taskIds.length) {
                const found = new Set(sourceTasksRaw.map((t) => String((t as { _id: unknown })._id)));
                const missing = taskIds.filter((id) => !found.has(id));
                return jsonError(`Task(s) not found or inactive: ${missing.join(', ')}`, 404);
            }

            const sourceTasks = sourceTasksRaw as unknown as AdminTaskDoc[];

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

            return NextResponse.json({ success: true, role, data: { tasks: tasksOut } });
        }

        // sub-admin: send SubAdminTask(s) -> UserTask(s)
        const subAdminOid = new mongoose.Types.ObjectId(session.user.id);

        const taskIdSet = new Set<string>();
        if (isValidObjectId(body?.taskId)) taskIdSet.add(body.taskId as string);
        if (Array.isArray(body?.taskIds)) for (const id of body.taskIds) if (isValidObjectId(id)) taskIdSet.add(id as string);
        if (taskIdSet.size === 0 && !(Array.isArray(body?.sends) && body.sends.length > 0)) {
            return jsonError('Provide taskId and/or taskIds[]', 400);
        }

        // support sends[] branch too (same as existing subadmin route)
        let pairs: { taskId: string; userId: string; description?: string }[] = [];
        if (Array.isArray(body?.sends) && body.sends.length > 0) {
            for (const s of body.sends) {
                const taskId = s?.taskId ?? s?.id;
                const userId = s?.userId;
                if (!isValidObjectId(taskId) || !isValidObjectId(userId)) continue;
                const description =
                    typeof s?.description === 'string'
                        ? s.description
                        : typeof body?.description === 'string'
                          ? body.description
                          : '';
                pairs.push({ taskId, userId, description });
            }
        } else {
            const orderedTaskIds = [...taskIdSet];
            const rawUserIds = body?.userIds;
            const usersMissingOrEmpty =
                rawUserIds === undefined ||
                rawUserIds === null ||
                (Array.isArray(rawUserIds) && rawUserIds.length === 0);

            let targetUserIds: string[];
            if (usersMissingOrEmpty) {
                const endUsers = await User.find({ role: 'user' }).select('_id').lean();
                targetUserIds = endUsers.map((u) => String((u as { _id: unknown })._id));
            } else {
                if (!Array.isArray(rawUserIds)) return jsonError('userIds must be an array when provided', 400);
                targetUserIds = [...new Set(rawUserIds.filter((id: unknown) => isValidObjectId(id)))];
                if (targetUserIds.length === 0) return jsonError('No valid ids in userIds', 400);
            }

            if (orderedTaskIds.length > 0 && targetUserIds.length === 0) {
                return NextResponse.json({ success: true, role, data: { tasks: orderedTaskIds.map((taskId) => ({ taskId, recipients: [] })) } });
            }

            const defaultDescription = typeof body?.description === 'string' ? body.description : '';
            for (const taskId of orderedTaskIds) for (const userId of targetUserIds) pairs.push({ taskId, userId, description: defaultDescription });
        }

        if (pairs.length === 0) return jsonError('No valid task/user pairs to send', 400);

        const subTaskIdSet = [...new Set(pairs.map((p) => p.taskId))];
        const subTasks = await SubAdminTask.find({
            _id: { $in: subTaskIdSet.map((id) => new mongoose.Types.ObjectId(id)) },
            subAdminId: subAdminOid,
            isActive: true,
            isDeletedBySubAdmin: false,
        }).lean();

        const taskMap = new Map<string, SubAdminTaskSendDoc>(
            subTasks.map((t) => {
                const doc = t as unknown as SubAdminTaskSendDoc;
                return [doc._id.toString(), doc];
            })
        );
        if (taskMap.size !== subTaskIdSet.length) return jsonError('One or more tasks are invalid or not owned by you', 400);

        const userIdSet = [...new Set(pairs.map((p) => p.userId))];
        const users = await User.find({
            _id: { $in: userIdSet.map((id) => new mongoose.Types.ObjectId(id)) },
            role: 'user',
        })
            .select('_id')
            .lean();
        const userOk = new Set(users.map((u) => String((u as { _id: unknown })._id)));
        if (userOk.size !== userIdSet.length) return jsonError('One or more target users are invalid or not end-users', 400);

        type Recipient = { userId: string; ok: boolean; error?: string };
        const byTask = new Map<string, Recipient[]>();

        for (const p of pairs) {
            const st = taskMap.get(p.taskId);
            if (!st) continue;
            try {
                await UserTask.findOneAndUpdate(
                    { userId: new mongoose.Types.ObjectId(p.userId), taskId: st._id },
                    {
                        $set: {
                            subAdminId: subAdminOid,
                            preparednessId: st.preparednessId,
                            title: st.title,
                            description: p.description ?? '',
                            sentAt: new Date(),
                        },
                    },
                    { upsert: true, new: true }
                );
                const list = byTask.get(p.taskId) ?? [];
                list.push({ userId: p.userId, ok: true });
                byTask.set(p.taskId, list);
            } catch {
                const list = byTask.get(p.taskId) ?? [];
                list.push({ userId: p.userId, ok: false, error: 'Failed to save' });
                byTask.set(p.taskId, list);
            }
        }

        const orderedKeys = [...new Set(pairs.map((p) => p.taskId))];
        const tasksPayload = orderedKeys.map((taskId) => ({ taskId, recipients: byTask.get(taskId) ?? [] }));

        return NextResponse.json({ success: true, role, data: { tasks: tasksPayload } });
    } catch (e) {
        console.error('POST /api/preparedness-tasks/send:', e);
        return jsonError('Internal Server Error', 500);
    }
}

