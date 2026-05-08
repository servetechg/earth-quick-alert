import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Task from '@/models/Task';
import SubAdminTask from '@/models/SubAdminTask';
import {
    syncDownstreamFromSuperAdminTaskTitle,
    syncDownstreamFromSuperAdminTasksDeleted,
    syncUserTasksTitleFromSubAdminTask,
    removeUserTasksForSubAdminTask,
} from '@/lib/preparedness-tasks/cascade-task-updates';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

/** Narrow lean docs from mongoose — avoids bad casts from `FlattenMaps<any>[] | …` unions. */
type LeanSuperTask = { _id: unknown; preparednessId: unknown; [key: string]: unknown };
type LeanSubAdminTask = {
    _id: unknown;
    subAdminId: unknown;
    preparednessId: unknown;
    sourceTaskId?: unknown | null;
    [key: string]: unknown;
};

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return jsonError('Unauthorized', 401);

        const role = session.user.role;
        if (role !== 'super-admin' && role !== 'sub-admin') return jsonError('Forbidden', 403);

        const resolved = await Promise.resolve(params);
        const { id } = resolved;
        if (!isValidObjectId(id)) return jsonError('Invalid id', 400);

        const body = await req.json().catch(() => null);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return jsonError('title is required', 400);

        await connectDB();

        if (role === 'super-admin') {
            const updated = await Task.findOneAndUpdate(
                { _id: id, isActive: true },
                { $set: { title } },
                { new: true }
            ).lean();

            if (!updated) return jsonError('Task not found or inactive', 404);

            await syncDownstreamFromSuperAdminTaskTitle(id, title);

            const task = updated as unknown as LeanSuperTask;
            return NextResponse.json({
                success: true,
                role,
                data: {
                    ...task,
                    _id: String(task._id),
                    preparednessId: String(task.preparednessId),
                },
            });
        }

        // sub-admin
        const subAdminOid = new mongoose.Types.ObjectId(session.user.id);
        const updated = await SubAdminTask.findOneAndUpdate(
            { _id: id, subAdminId: subAdminOid, isActive: true, isDeletedBySubAdmin: false },
            { $set: { title } },
            { new: true }
        ).lean();

        if (!updated) return jsonError('Task not found or not editable', 404);

        await syncUserTasksTitleFromSubAdminTask(id, title);

        const sat = updated as unknown as LeanSubAdminTask;
        return NextResponse.json({
            success: true,
            role,
            data: {
                ...sat,
                _id: String(sat._id),
                subAdminId: String(sat.subAdminId),
                preparednessId: String(sat.preparednessId),
                sourceTaskId: sat.sourceTaskId != null ? String(sat.sourceTaskId) : null,
            },
        });
    } catch (e) {
        console.error('PUT /api/preparedness-tasks/[id]:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return jsonError('Unauthorized', 401);

        const role = session.user.role;
        if (role !== 'super-admin' && role !== 'sub-admin') return jsonError('Forbidden', 403);

        const resolved = await Promise.resolve(params);
        const { id } = resolved;
        if (!isValidObjectId(id)) return jsonError('Invalid id', 400);

        await connectDB();

        if (role === 'super-admin') {
            const updated = await Task.findOneAndUpdate(
                { _id: id, isActive: true },
                { $set: { isActive: false } },
                { new: true }
            ).lean();

            if (!updated) return jsonError('Task not found or already inactive', 404);

            await syncDownstreamFromSuperAdminTasksDeleted([id]);

            return NextResponse.json({ success: true, role });
        }

        const subAdminOid = new mongoose.Types.ObjectId(session.user.id);
        const updated = await SubAdminTask.findOneAndUpdate(
            { _id: id, subAdminId: subAdminOid, isActive: true, isDeletedBySubAdmin: false },
            { $set: { isDeletedBySubAdmin: true } },
            { new: true }
        ).lean();

        if (!updated) return jsonError('Task not found or already removed', 404);

        await removeUserTasksForSubAdminTask(id);

        return NextResponse.json({ success: true, role });
    } catch (e) {
        console.error('DELETE /api/preparedness-tasks/[id]:', e);
        return jsonError('Internal Server Error', 500);
    }
}

