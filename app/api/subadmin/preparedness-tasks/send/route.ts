import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import SubAdminTask from '@/models/SubAdminTask';
import User from '@/models/User';
import UserTask from '@/models/UserTask';
import { requireSubAdmin } from '@/lib/preparedness-tasks/auth';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

type SendPair = { taskId: string; userId: string; description?: string };

type SubAdminTaskSendDoc = {
    _id: mongoose.Types.ObjectId;
    preparednessId: mongoose.Types.ObjectId;
    title: string;
};

export async function POST(req: NextRequest) {
    try {
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        await connectDB();

        const subAdminOid = new mongoose.Types.ObjectId(gate.session.user.id);

        let pairs: SendPair[] = [];

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
            const taskIdSet = new Set<string>();
            if (isValidObjectId(body?.taskId)) taskIdSet.add(body.taskId as string);
            if (Array.isArray(body?.taskIds)) {
                for (const id of body.taskIds) if (isValidObjectId(id)) taskIdSet.add(id as string);
            }
            if (taskIdSet.size === 0) return jsonError('Provide taskId and/or taskIds[]', 400);

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

            const defaultDescription = typeof body?.description === 'string' ? body.description : '';

            if (orderedTaskIds.length > 0 && targetUserIds.length === 0) {
                return NextResponse.json({
                    success: true,
                    data: { tasks: orderedTaskIds.map((taskId) => ({ taskId, recipients: [] })) },
                });
            }

            for (const taskId of orderedTaskIds) {
                for (const userId of targetUserIds) {
                    pairs.push({ taskId, userId, description: defaultDescription });
                }
            }
        }

        const taskIdSet = [...new Set(pairs.map((p) => p.taskId))];
        const subTasks = await SubAdminTask.find({
            _id: { $in: taskIdSet.map((id) => new mongoose.Types.ObjectId(id)) },
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
        if (taskMap.size !== taskIdSet.length) return jsonError('One or more tasks are invalid or not owned by you', 400);

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

        return NextResponse.json({ success: true, data: { tasks: tasksPayload } });
    } catch (e) {
        console.error('POST /api/subadmin/preparedness-tasks/send:', e);
        return jsonError('Internal Server Error', 500);
    }
}

