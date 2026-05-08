import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import UserTask from '@/models/UserTask';
import { requireEndUser } from '@/lib/preparedness-tasks/auth';

export const dynamic = 'force-dynamic';

type LeanUserTaskRow = {
    _id: unknown;
    userId: unknown;
    subAdminId: unknown;
    preparednessId: unknown;
    taskId: unknown;
    [key: string]: unknown;
};

export async function GET() {
    try {
        const gate = await requireEndUser();
        if ('error' in gate) return gate.error;

        await connectDB();

        const userOid = new mongoose.Types.ObjectId(gate.session.user.id);
        const tasks = await UserTask.find({ userId: userOid }).sort({ sentAt: -1 }).lean();

        return NextResponse.json({
            success: true,
            data: tasks.map((t) => {
                const row = t as unknown as LeanUserTaskRow;
                return {
                    ...row,
                    _id: String(row._id),
                    userId: String(row.userId),
                    subAdminId: String(row.subAdminId),
                    preparednessId: String(row.preparednessId),
                    taskId: String(row.taskId),
                };
            }),
        });
    } catch (e) {
        console.error('GET /api/user/tasks:', e);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

