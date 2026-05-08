import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Task from '@/models/Task';
import { syncDownstreamFromSuperAdminTaskTitle, syncDownstreamFromSuperAdminTasksDeleted } from '@/lib/preparedness-tasks/cascade-task-updates';
import { requireSuperAdmin } from '@/lib/preparedness-tasks/auth';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

type LeanSuperTask = { _id: unknown; preparednessId: unknown; [key: string]: unknown };

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ taskId: string }> | { taskId: string } }
) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const resolved = await Promise.resolve(params);
        const { taskId } = resolved;
        if (!isValidObjectId(taskId)) return jsonError('Invalid taskId', 400);

        const body = await req.json().catch(() => null);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return jsonError('title is required', 400);

        await connectDB();

        const updated = await Task.findOneAndUpdate(
            { _id: taskId, isActive: true },
            { $set: { title } },
            { new: true }
        ).lean();

        if (!updated) return jsonError('Task not found or inactive', 404);

        await syncDownstreamFromSuperAdminTaskTitle(taskId, title);

        const task = updated as unknown as LeanSuperTask;
        return NextResponse.json({
            success: true,
            data: {
                ...task,
                _id: String(task._id),
                preparednessId: String(task.preparednessId),
            },
        });
    } catch (e) {
        console.error('PUT /api/admin/preparedness-tasks/[taskId]:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ taskId: string }> | { taskId: string } }
) {
    try {
        const gate = await requireSuperAdmin();
        if ('error' in gate) return gate.error;

        const resolved = await Promise.resolve(params);
        const { taskId } = resolved;
        if (!isValidObjectId(taskId)) return jsonError('Invalid taskId', 400);

        await connectDB();

        const updated = await Task.findOneAndUpdate(
            { _id: taskId, isActive: true },
            { $set: { isActive: false } },
            { new: true }
        ).lean();

        if (!updated) return jsonError('Task not found or already inactive', 404);

        await syncDownstreamFromSuperAdminTasksDeleted([taskId]);

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/admin/preparedness-tasks/[taskId]:', e);
        return jsonError('Internal Server Error', 500);
    }
}

