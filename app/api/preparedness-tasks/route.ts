import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import PreparednessGuide from '@/models/PreparednessGuide';
import Task from '@/models/Task';
import SubAdminTask from '@/models/SubAdminTask';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

type CreateInput = { preparednessId: string; title: string };

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

function parseCreateItems(body: any): CreateInput[] {
    const items: CreateInput[] = [];

    if (Array.isArray(body?.items)) {
        for (const row of body.items) {
            const preparednessId = row?.preparednessId;
            const title = typeof row?.title === 'string' ? row.title.trim() : '';
            if (isValidObjectId(preparednessId) && title) items.push({ preparednessId, title });
        }
        return items;
    }

    const preparednessId = body?.preparednessId;
    if (!isValidObjectId(preparednessId)) return [];

    if (Array.isArray(body?.tasks)) {
        for (const row of body.tasks) {
            const title = typeof row?.title === 'string' ? row.title.trim() : '';
            if (title) items.push({ preparednessId, title });
        }
        return items;
    }

    if (typeof body?.title === 'string' && body.title.trim()) {
        items.push({ preparednessId, title: body.title.trim() });
    }

    return items;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return jsonError('Unauthorized', 401);

        const role = session.user.role;
        if (role !== 'super-admin' && role !== 'sub-admin') {
            return jsonError('Forbidden', 403);
        }

        const body = await req.json().catch(() => null);
        if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

        const items = parseCreateItems(body);
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

        if (role === 'super-admin') {
            const userId = new mongoose.Types.ObjectId(session.user.id);
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
                role,
                data: inserted.map((t) => ({
                    ...t.toObject(),
                    _id: t._id.toString(),
                    preparednessId: t.preparednessId.toString(),
                    createdByUserId: t.createdByUserId?.toString(),
                })),
                count: inserted.length,
            });
        }

        // sub-admin
        const subAdminId = new mongoose.Types.ObjectId(session.user.id);
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
            role,
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
        console.error('POST /api/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return jsonError('Unauthorized', 401);

        const role = session.user.role;
        if (role !== 'super-admin' && role !== 'sub-admin') return jsonError('Forbidden', 403);

        const body = await req.json().catch(() => null);
        const updates = body?.updates;
        if (!Array.isArray(updates) || updates.length === 0) return jsonError('updates[] is required', 400);

        await connectDB();

        if (role === 'super-admin') {
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
            return NextResponse.json({ success: true, role, results });
        }

        // sub-admin
        const subAdminOid = new mongoose.Types.ObjectId(session.user.id);
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
            else results.push({ id, ok: true });
        }
        return NextResponse.json({ success: true, role, results });
    } catch (e) {
        console.error('PUT /api/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return jsonError('Unauthorized', 401);

        const role = session.user.role;
        if (role !== 'super-admin' && role !== 'sub-admin') return jsonError('Forbidden', 403);

        const body = await req.json().catch(() => null);
        const taskIds = body?.taskIds;
        if (!Array.isArray(taskIds) || taskIds.length === 0) return jsonError('taskIds[] is required', 400);

        const ids = taskIds.filter((id: unknown) => isValidObjectId(id));
        if (ids.length === 0) return jsonError('No valid task ids', 400);

        await connectDB();

        if (role === 'super-admin') {
            const res = await Task.updateMany({ _id: { $in: ids } }, { $set: { isActive: false } });
            return NextResponse.json({ success: true, role, matched: res.matchedCount, modified: res.modifiedCount });
        }

        const subAdminOid = new mongoose.Types.ObjectId(session.user.id);
        const res = await SubAdminTask.updateMany(
            { _id: { $in: ids }, subAdminId: subAdminOid },
            { $set: { isDeletedBySubAdmin: true } }
        );
        return NextResponse.json({ success: true, role, matched: res.matchedCount, modified: res.modifiedCount });
    } catch (e) {
        console.error('DELETE /api/preparedness-tasks:', e);
        return jsonError('Internal Server Error', 500);
    }
}

