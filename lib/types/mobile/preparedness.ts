export type MobilePreparednessCategory = {
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    taskCount: number;
    sortOrder: number;
};

export type MobilePreparednessTask = {
    id: string;
    categoryId: string;
    title: string;
    body: string;
    sortOrder: number;
};
