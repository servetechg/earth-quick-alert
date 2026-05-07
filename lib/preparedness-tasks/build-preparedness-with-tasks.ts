import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import PreparednessGuide from '@/models/PreparednessGuide';
import Task from '@/models/Task';
import SubAdminTask from '@/models/SubAdminTask';
import UserTask from '@/models/UserTask';

export type PreparednessWithTasksMode = 'super-admin' | 'sub-admin' | 'user';

export type SimpleTask = {
    _id: string;
    title: string;
    createdBy: string;
    isActive: boolean;
};

export type SimplePreparednessWithTasks = {
    _id: string;
    category: string;
    tasks: SimpleTask[];
};

function groupByPreparednessId<T extends { preparednessId: unknown }>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const t of rows) {
        const pid = String(t.preparednessId);
        const list = map.get(pid) ?? [];
        list.push(t);
        map.set(pid, list);
    }
    return map;
}

export async function buildPreparednessWithTasks(params: {
    mode: PreparednessWithTasksMode;
    userId: string;
    includeInactive?: boolean;
}): Promise<SimplePreparednessWithTasks[]> {
    await connectDB();

    const guides = await PreparednessGuide.find({})
        .sort({ order: 1, category: 1 })
        .lean();

    const guideIds = guides.map((g) => g._id as mongoose.Types.ObjectId);
    const userOid = new mongoose.Types.ObjectId(params.userId);

    const tasksByPrep = new Map<string, SimpleTask[]>();

    if (params.mode === 'super-admin') {
        const taskFilter: Record<string, unknown> = {
            preparednessId: { $in: guideIds },
        };
        if (!params.includeInactive) {
            taskFilter.isActive = true;
        }
        const raw = await Task.find(taskFilter).sort({ updatedAt: -1 }).lean();
        const grouped = groupByPreparednessId(raw as unknown as { preparednessId: mongoose.Types.ObjectId }[]);
        for (const [pid, list] of grouped) {
            tasksByPrep.set(
                pid,
                list.map((t) => {
                    const doc = t as unknown as {
                        _id: mongoose.Types.ObjectId;
                        title: string;
                        createdBy: string;
                        isActive: boolean;
                    };
                    return {
                        _id: doc._id.toString(),
                        title: doc.title,
                        createdBy: doc.createdBy,
                        isActive: doc.isActive,
                    };
                })
            );
        }
    } else if (params.mode === 'sub-admin') {
        const taskFilter: Record<string, unknown> = {
            subAdminId: userOid,
            isDeletedBySubAdmin: false,
            isActive: true,
        };
        const raw = await SubAdminTask.find(taskFilter).sort({ updatedAt: -1 }).lean();
        const grouped = groupByPreparednessId(raw as unknown as { preparednessId: mongoose.Types.ObjectId }[]);
        for (const [pid, list] of grouped) {
            tasksByPrep.set(
                pid,
                list.map((t) => {
                    const doc = t as unknown as {
                        _id: mongoose.Types.ObjectId;
                        title: string;
                        createdBy: string;
                        isActive: boolean;
                    };
                    return {
                        _id: doc._id.toString(),
                        title: doc.title,
                        createdBy: doc.createdBy,
                        isActive: doc.isActive,
                    };
                })
            );
        }
    } else {
        const raw = await UserTask.find({ userId: userOid }).sort({ sentAt: -1 }).lean();
        const grouped = groupByPreparednessId(raw as unknown as { preparednessId: mongoose.Types.ObjectId }[]);
        for (const [pid, list] of grouped) {
            tasksByPrep.set(
                pid,
                list.map((t) => {
                    const doc = t as unknown as { _id: mongoose.Types.ObjectId; title: string };
                    return {
                        _id: doc._id.toString(),
                        title: doc.title,
                        createdBy: 'user',
                        isActive: true,
                    };
                })
            );
        }
    }

    type GuideLean = { _id: mongoose.Types.ObjectId; category: string };

    return (guides as unknown as GuideLean[]).map((g) => {
        const idStr = String(g._id);
        return {
            _id: idStr,
            category: g.category,
            tasks: tasksByPrep.get(idStr) ?? [],
        };
    });
}

