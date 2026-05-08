import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import PreparednessGuide from '@/models/PreparednessGuide';
import SubAdminTask from '@/models/SubAdminTask';
import { removeUserTasksForSubAdminTasks, syncUserTasksTitleFromSubAdminTask } from '@/lib/preparedness-tasks/cascade-task-updates';
import { requireSubAdmin } from '@/lib/preparedness-tasks/auth';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

type CreateInput = { preparednessId: string; title: string };

type LeanSubAdminTaskRow = {
    _id: unknown;
    subAdminId: unknown;
    preparednessId: unknown;
    sourceTaskId?: unknown | null;
    [key: string]: unknown;
};

export async function GET(req: NextRequest) {
    try {
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const preparednessId = req.nextUrl.searchParams.get('preparednessId');
        if (!preparednessId || !isValidObjectId(preparednessId)) {
            return jsonError('Valid preparednessId query parameter is required', 400);
        }

        await connectDB();

        const subAdminOid = new mongoose.Types.ObjectId(gate.session.user.id);

        const exists = await PreparednessGuide.exists({ _id: preparednessId });
        if (!exists) return jsonError('Preparedness guide not found', 404);

        const tasks = await SubAdminTask.find({
            subAdminId: subAdminOid,
            preparednessId,
            isDeletedBySubAdmin: false,
            isActive: true,
        })
            .sort({ updatedAt: -1 })
            .lean();

        return NextResponse.json({
            success: true,
            data: tasks.map((t) => {
                const row = t as unknown as LeanSubAdminTaskRow;
                return {
                    ...row,
                    _id: String(row._id),
                    subAdminId: String(row.subAdminId),
                    preparednessId: String(row.preparednessId),
                    sourceTaskId: row.sourceTaskId != null ? String(row.sourceTaskId) : null,
                };
            }),
        });
    } catch (e) {
        console.error('GET /api/subadmin/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

        const items: CreateInput[] = [];
        if (Array.isArray(body.items)) {
            for (const row of body.items) {
                if (row && typeof row === 'object' && isValidObjectId((row as CreateInput).preparednessId)) {
                    const title =
                        typeof (row as CreateInput).title === 'string' ? (row as CreateInput).title.trim() : '';
                    if (title) items.push({ preparednessId: (row as CreateInput).preparednessId, title });
                }
            }
        } else if (isValidObjectId(body.preparednessId)) {
            const preparednessId = body.preparednessId as string;
            if (Array.isArray(body.tasks)) {
                for (const row of body.tasks) {
                    const title =
                        row && typeof row === 'object' && typeof (row as { title?: string }).title === 'string'
                            ? (row as { title: string }).title.trim()
                            : '';
                    if (title) items.push({ preparednessId, title });
                }
            } else if (typeof body.title === 'string' && body.title.trim()) {
                items.push({ preparednessId, title: body.title.trim() });
            }
        }

        if (items.length === 0) {
            return jsonError(
                'Provide preparednessId + title, preparednessId + tasks[], or items[{ preparednessId, title }]',
                400
            );
        }

        await connectDB();

        const preparednessIds = [...new Set(items.map((i) => i.preparednessId))];
        const guideCount = await PreparednessGuide.countDocuments({
            _id: { $in: preparednessIds.map((id) => new mongoose.Types.ObjectId(id)) },
        });
        if (guideCount !== preparednessIds.length) return jsonError('One or more preparednessIds are invalid', 404);

        const subAdminId = new mongoose.Types.ObjectId(gate.session.user.id);
        const docs = items.map((i) => ({
            subAdminId,
            preparednessId: new mongoose.Types.ObjectId(i.preparednessId),
            sourceTaskId: null,
            title: i.title,
            createdBy: 'sub_admin' as const,
            isDeletedBySubAdmin: false,
            isActive: true,
        }));

        const inserted = await SubAdminTask.insertMany(docs);
        return NextResponse.json({
            success: true,
            data: inserted.map((t) => ({
                ...t.toObject(),
                _id: t._id.toString(),
                subAdminId: t.subAdminId.toString(),
                preparednessId: t.preparednessId.toString(),
                sourceTaskId: null,
            })),
            count: inserted.length,
        });
    } catch (e) {
        console.error('POST /api/subadmin/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function PUT(req: NextRequest) {
    try {
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        const updates = body?.updates;
        if (!Array.isArray(updates) || updates.length === 0) return jsonError('updates[] is required', 400);

        await connectDB();
        const subAdminOid = new mongoose.Types.ObjectId(gate.session.user.id);

        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const u of updates) {
            const id = u?.id ?? u?.taskId ?? u?._id;
            const title = typeof u?.title === 'string' ? u.title.trim() : '';
            if (!isValidObjectId(id) || !title) {
                results.push({ id: String(id), ok: false, error: 'Invalid id or title' });
                continue;
            }
            const updated = await SubAdminTask.findOneAndUpdate(
                { _id: id, subAdminId: subAdminOid, isActive: true, isDeletedBySubAdmin: false },
                { $set: { title } },
                { new: true }
            ).lean();
            if (!updated) results.push({ id, ok: false, error: 'Task not found or not editable' });
            else {
                await syncUserTasksTitleFromSubAdminTask(id, title);
                results.push({ id, ok: true });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (e) {
        console.error('PUT /api/subadmin/preparedness-tasks (batch):', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        const taskIds = body?.taskIds;
        if (!Array.isArray(taskIds) || taskIds.length === 0) return jsonError('taskIds[] is required', 400);

        const ids = taskIds.filter((id: unknown) => isValidObjectId(id));
        if (ids.length === 0) return jsonError('No valid task ids', 400);

        await connectDB();
        const subAdminOid = new mongoose.Types.ObjectId(gate.session.user.id);

        const res = await SubAdminTask.updateMany(
            { _id: { $in: ids }, subAdminId: subAdminOid },
            { $set: { isDeletedBySubAdmin: true } }
        );

        await removeUserTasksForSubAdminTasks(ids.map((id) => new mongoose.Types.ObjectId(id as string)));

        return NextResponse.json({ success: true, matched: res.matchedCount, modified: res.modifiedCount });
    } catch (e) {
        console.error('DELETE /api/subadmin/preparedness-tasks (batch):', e);
        return jsonError('Internal Server Error', 500);
    }
}

