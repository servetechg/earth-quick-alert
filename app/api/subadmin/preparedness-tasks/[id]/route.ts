import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import SubAdminTask from '@/models/SubAdminTask';
import { removeUserTasksForSubAdminTask, syncUserTasksTitleFromSubAdminTask } from '@/lib/preparedness-tasks/cascade-task-updates';
import { requireSubAdmin } from '@/lib/preparedness-tasks/auth';
import { isValidObjectId } from '@/lib/preparedness-tasks/object-id';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
    return NextResponse.json({ success: false, error: message }, { status });
}

type LeanSubAdminTaskRow = {
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
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const resolved = await Promise.resolve(params);
        const { id } = resolved;
        if (!isValidObjectId(id)) return jsonError('Invalid id', 400);

        const body = await req.json().catch(() => null);
        const title = typeof body?.title === 'string' ? body.title.trim() : '';
        if (!title) return jsonError('title is required', 400);

        await connectDB();
        const subAdminOid = new mongoose.Types.ObjectId(gate.session.user.id);

        const updated = await SubAdminTask.findOneAndUpdate(
            { _id: id, subAdminId: subAdminOid, isActive: true, isDeletedBySubAdmin: false },
            { $set: { title } },
            { new: true }
        ).lean();

        if (!updated) return jsonError('Task not found or not editable', 404);

        await syncUserTasksTitleFromSubAdminTask(id, title);

        const sat = updated as unknown as LeanSubAdminTaskRow;
        return NextResponse.json({
            success: true,
            data: {
                ...sat,
                _id: String(sat._id),
                subAdminId: String(sat.subAdminId),
                preparednessId: String(sat.preparednessId),
                sourceTaskId: sat.sourceTaskId != null ? String(sat.sourceTaskId) : null,
            },
        });
    } catch (e) {
        console.error('PUT /api/subadmin/preparedness-tasks/[id]:', e);
        return jsonError('Internal Server Error', 500);
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const gate = await requireSubAdmin();
        if ('error' in gate) return gate.error;

        const resolved = await Promise.resolve(params);
        const { id } = resolved;
        if (!isValidObjectId(id)) return jsonError('Invalid id', 400);

        await connectDB();
        const subAdminOid = new mongoose.Types.ObjectId(gate.session.user.id);

        const updated = await SubAdminTask.findOneAndUpdate(
            { _id: id, subAdminId: subAdminOid, isActive: true, isDeletedBySubAdmin: false },
            { $set: { isDeletedBySubAdmin: true } },
            { new: true }
        ).lean();

        if (!updated) return jsonError('Task not found or already removed', 404);

        await removeUserTasksForSubAdminTask(id);

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/subadmin/preparedness-tasks/[id]:', e);
        return jsonError('Internal Server Error', 500);
    }
}

