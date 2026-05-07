import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PreparednessGuide from '@/models/PreparednessGuide';
import Task from '@/models/Task';
import { requireSuperAdmin } from '@/lib/preparedness-tasks/auth';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';
import mongoose from 'mongoose';

export const dynamic = 'force-dynamic';

type CreateInput = { preparednessId: string; title: string };

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const preparednessId = req.nextUrl.searchParams.get('preparednessId');
        if (!preparednessId || !isValidObjectId(preparednessId)) {
            return jsonError('Valid preparednessId query parameter is required', 400);
        }

        await connectDB();
        const exists = await PreparednessGuide.exists({ _id: preparednessId });
        if (!exists) {
            return jsonError('Preparedness guide not found', 404);
        }

        const tasks = await Task.find({ preparednessId, isActive: true }).sort({ updatedAt: -1 }).lean();
        type TaskLean = {
            _id: mongoose.Types.ObjectId;
            preparednessId: mongoose.Types.ObjectId;
            createdByUserId?: mongoose.Types.ObjectId;
        };

        return NextResponse.json({
            success: true,
            data: (tasks as unknown as TaskLean[]).map((t) => ({
                ...t,
                _id: t._id.toString(),
                preparednessId: t.preparednessId.toString(),
                createdByUserId: t.createdByUserId?.toString(),
            })),
        });
    } catch (e) {
        console.error('GET /api/admin/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return jsonError('Invalid JSON body', 400);
        }

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
        if (guideCount !== preparednessIds.length) {
            return jsonError('One or more preparednessIds are invalid', 404);
        }

        const userId = new mongoose.Types.ObjectId(gate.session.user.id);
        const docs = items.map((i) => ({
            preparednessId: new mongoose.Types.ObjectId(i.preparednessId),
            title: i.title,
            createdBy: 'super_admin' as const,
            createdByUserId: userId,
            isActive: true,
        }));

        const inserted = await Task.insertMany(docs);
        return NextResponse.json({
            success: true,
            data: inserted.map((t) => ({
                ...t.toObject(),
                _id: t._id.toString(),
                preparednessId: t.preparednessId.toString(),
                createdByUserId: t.createdByUserId?.toString(),
            })),
            count: inserted.length,
        });
    } catch (e) {
        console.error('POST /api/admin/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function PUT(req: NextRequest) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        const updates = body?.updates;
        if (!Array.isArray(updates) || updates.length === 0) {
            return jsonError('updates[] is required', 400);
        }

        await connectDB();

        const results: { taskId: string; ok: boolean; error?: string }[] = [];

        for (const u of updates) {
            const taskId = u?.taskId ?? u?._id;
            const title = typeof u?.title === 'string' ? u.title.trim() : '';
            if (!isValidObjectId(taskId) || !title) {
                results.push({ taskId: String(taskId), ok: false, error: 'Invalid taskId or title' });
                continue;
            }

            const updated = await Task.findOneAndUpdate(
                { _id: taskId, isActive: true },
                { $set: { title } },
                { new: true }
            ).lean();

            if (!updated) results.push({ taskId, ok: false, error: 'Task not found or inactive' });
            else results.push({ taskId, ok: true });
        }

        return NextResponse.json({ success: true, results });
    } catch (e) {
        console.error('PUT /api/admin/preparedness-tasks (batch):', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const body = await req.json().catch(() => null);
        const taskIds = body?.taskIds;
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return jsonError('taskIds[] is required', 400);
        }

        const ids = taskIds.filter((id: unknown) => isValidObjectId(id));
        if (ids.length === 0) {
            return jsonError('No valid task ids', 400);
        }

        await connectDB();

        const res = await Task.updateMany({ _id: { $in: ids } }, { $set: { isActive: false } });
        return NextResponse.json({ success: true, matched: res.matchedCount, modified: res.modifiedCount });
    } catch (e) {
        console.error('DELETE /api/admin/preparedness-tasks (batch):', e);
        return jsonError('Internal Server Error', 500);
    }
}

