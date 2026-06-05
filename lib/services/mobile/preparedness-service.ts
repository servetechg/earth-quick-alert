import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import PreparednessGuide from '@/models/PreparednessGuide';
import SubAdminTask from '@/models/SubAdminTask';
import { resolvePreparednessSubAdminForUser } from '@/lib/services/mobile/resolve-preparedness-sub-admin';

const CATEGORY_ICONS: Record<string, string> = {
    'Active Shooter': 'flame',
    'Earthquake': 'earth',
    'Flood': 'water',
    'Fire': 'flame',
    'Tornado': 'storm',
    'Hurricane': 'storm',
};

function categoryToId(category: string): string {
    return category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function idToCategoryPattern(id: string): RegExp {
    const stem = id.replace(/-/g, '[-\\s]+');
    return new RegExp(`^${stem}$`, 'i');
}

type GuideLean = { _id: mongoose.Types.ObjectId; category: string; order?: number };

type SubAdminTaskLean = {
    _id: mongoose.Types.ObjectId;
    preparednessId: mongoose.Types.ObjectId;
    title: string;
    createdAt?: Date;
};

async function loadScopedSubAdminTasks(userId: string): Promise<{
    scope: Awaited<ReturnType<typeof resolvePreparednessSubAdminForUser>>;
    tasks: SubAdminTaskLean[];
    guides: GuideLean[];
}> {
    await connectDB();
    const scope = await resolvePreparednessSubAdminForUser(userId);
    if (!scope) {
        return { scope: null, tasks: [], guides: [] };
    }

    const subAdminOid = new mongoose.Types.ObjectId(scope.subAdminId);
    const tasks = (await SubAdminTask.find({
        subAdminId: subAdminOid,
        isActive: { $ne: false },
        isDeletedBySubAdmin: { $ne: true },
    })
        .sort({ createdAt: 1 })
        .lean()) as unknown as SubAdminTaskLean[];

    if (tasks.length === 0) {
        return { scope, tasks: [], guides: [] };
    }

    const prepIds = [...new Set(tasks.map((t) => String(t.preparednessId)))];
    const guides = (await PreparednessGuide.find({
        _id: { $in: prepIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
        .sort({ order: 1, category: 1 })
        .lean()) as unknown as GuideLean[];

    return { scope, tasks, guides };
}

function groupTasksByPreparednessId(tasks: SubAdminTaskLean[]): Map<string, SubAdminTaskLean[]> {
    const map = new Map<string, SubAdminTaskLean[]>();
    for (const task of tasks) {
        const key = String(task.preparednessId);
        const list = map.get(key) ?? [];
        list.push(task);
        map.set(key, list);
    }
    return map;
}

function buildCategoryItem(
    guide: GuideLean,
    taskCount: number,
    sortOrder: number,
): {
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    taskCount: number;
    sortOrder: number;
} {
    const id = categoryToId(guide.category);
    return {
        id,
        title: guide.category.includes('Preparedness')
            ? guide.category
            : `${guide.category} Preparedness`,
        subtitle: `Emergency guidance for ${guide.category.toLowerCase()} events`,
        icon: CATEGORY_ICONS[guide.category] ?? 'shield',
        taskCount,
        sortOrder,
    };
}

export async function listMobilePreparednessCategories(userId: string, q?: string) {
    const { scope, tasks, guides } = await loadScopedSubAdminTasks(userId);
    if (!scope || guides.length === 0) {
        return { items: [] as ReturnType<typeof buildCategoryItem>[] };
    }

    const tasksByPrep = groupTasksByPreparednessId(tasks);

    let items = guides
        .map((g, idx) => {
            const prepTasks = tasksByPrep.get(String(g._id)) ?? [];
            return buildCategoryItem(g, prepTasks.length, g.order ?? idx + 1);
        })
        .filter((item) => item.taskCount > 0);

    if (q?.trim()) {
        const needle = q.trim().toLowerCase();
        items = items.filter(
            (c) =>
                c.title.toLowerCase().includes(needle) ||
                c.subtitle.toLowerCase().includes(needle),
        );
    }

    return { items };
}

export async function getMobilePreparednessCategory(userId: string, categoryId: string) {
    const { scope, tasks, guides } = await loadScopedSubAdminTasks(userId);
    if (!scope) {
        return null;
    }

    let guide = guides.find((g) => categoryToId(g.category) === categoryId);
    if (!guide) {
        const pattern = idToCategoryPattern(categoryId);
        guide = guides.find((g) => pattern.test(g.category.replace(/\s+/g, '-')));
    }
    if (!guide) {
        return null;
    }

    const prepTasks = tasks.filter((t) => String(t.preparednessId) === String(guide!._id));
    if (prepTasks.length === 0) {
        return null;
    }

    const meta = buildCategoryItem(guide, prepTasks.length, guide.order ?? 0);
    return {
        id: meta.id,
        title: meta.title,
        subtitle: meta.subtitle,
        icon: meta.icon,
        intro: `Review local preparedness tasks for ${guide.category} in your area.`,
    };
}

export async function listMobilePreparednessTasks(userId: string, categoryId: string) {
    const { scope, tasks, guides } = await loadScopedSubAdminTasks(userId);
    if (!scope) {
        return null;
    }

    let guide = guides.find((g) => categoryToId(g.category) === categoryId);
    if (!guide) {
        const pattern = idToCategoryPattern(categoryId);
        guide = guides.find((g) => pattern.test(g.category.replace(/\s+/g, '-')));
    }
    if (!guide) {
        return null;
    }

    const categoryTasks = tasks.filter((t) => String(t.preparednessId) === String(guide!._id));

    return {
        categoryId,
        items: categoryTasks.map((t, idx) => ({
            id: String(t._id),
            categoryId,
            title: t.title,
            body: `Complete this step: ${t.title}.`,
            sortOrder: idx + 1,
        })),
    };
}

/** Resolve category id when slug might be partial */
export async function findGuideByCategoryId(categoryId: string) {
    await connectDB();
    const guides = await PreparednessGuide.find({}).lean();
    let guide = guides.find((g) => categoryToId(g.category) === categoryId);
    if (!guide) {
        const pattern = idToCategoryPattern(categoryId);
        guide = guides.find((g) => pattern.test(g.category.replace(/\s+/g, '-')));
    }
    return guide ?? null;
}
