import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import UserTask from '@/models/UserTask';
import { requireEndUser } from '@/lib/preparedness-tasks/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const gate = await requireEndUser();
        if ('error' in gate) return gate.error;

        await connectDB();

        const userOid = new mongoose.Types.ObjectId(gate.session.user.id);
        const tasks = await UserTask.find({ userId: userOid }).sort({ sentAt: -1 }).lean();

        return NextResponse.json({
            success: true,
            data: tasks.map((t) => ({
                ...t,
                _id: String((t as { _id: unknown })._id),
                userId: String((t as { userId: unknown }).userId),
                subAdminId: String((t as { subAdminId: unknown }).subAdminId),
                preparednessId: String((t as { preparednessId: unknown }).preparednessId),
                taskId: String((t as { taskId: unknown }).taskId),
            })),
        });
    } catch (e) {
        console.error('GET /api/user/tasks:', e);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

