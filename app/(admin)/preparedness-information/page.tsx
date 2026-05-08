'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminPageHeader } from '@/components/admin-page-header';
import { AdminPageShell } from '@/components/admin-page-shell';
import {
  CheckCircle2,
  Flame,
  Globe,
  Loader2,
  MapPin,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { TaskSectionCard } from '@/components/preparedness/task-section-card';
import type {
  PreparednessApiGroup,
  PreparednessApiRole,
  PreparednessUiSection,
} from '@/lib/preparedness-tasks/client-types';
import {
  getPreparednessCategoryLabel,
  sortPreparednessCategories,
} from '@/lib/preparedness-tasks/category-labels';

type EditableRole = Extract<PreparednessApiRole, 'super-admin' | 'sub-admin'>;

function getCategoryIcon(category: string) {
  const normalized = category.toLowerCase().replace(/[\s-]+/g, '_');

  switch (normalized) {
    case 'individual_evacuation':
      return <MapPin className="w-4 h-4" />;
    case 'community_evacuation':
      return <Globe className="w-4 h-4" />;
    case 'shelter_in_place':
      return <MapPin className="w-4 h-4" />;
    case 'active_shooter':
      return <Flame className="w-4 h-4" />;
    case 'pets_household':
      return <User className="w-4 h-4" />;
    case 'pets_large':
      return <Globe className="w-4 h-4" />;
    case 'identity_theft':
      return <ShieldCheck className="w-4 h-4" />;
    case 'choking_first_aid':
      return <CheckCircle2 className="w-4 h-4" />;
    default:
      if (normalized.includes('shooter')) return <Flame className="w-4 h-4" />;
      if (normalized.includes('community')) return <Globe className="w-4 h-4" />;
      if (normalized.includes('shelter')) return <MapPin className="w-4 h-4" />;
      if (normalized.includes('pet') || normalized.includes('household')) return <User className="w-4 h-4" />;
      if (normalized.includes('identity') || normalized.includes('theft'))
        return <ShieldCheck className="w-4 h-4" />;
      if (normalized.includes('choking') || normalized.includes('aid'))
        return <CheckCircle2 className="w-4 h-4" />;
      return <MapPin className="w-4 h-4" />;
  }
}

function makeTempId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toUiSections(groups: PreparednessApiGroup[]): PreparednessUiSection[] {
  return sortPreparednessCategories(groups).map((group) => ({
    preparednessId: group._id,
    category: group.category,
    label: getPreparednessCategoryLabel(group.category),
    tasks: group.tasks.map((task) => ({
      id: task._id,
      title: task.title,
      persisted: true,
    })),
  }));
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  return payload;
}

export default function PreparednessInformationPage() {
  const [role, setRole] = useState<EditableRole | null>(null);
  const [sections, setSections] = useState<PreparednessUiSection[]>([]);
  const [initialSections, setInitialSections] = useState<PreparednessUiSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingBySection, setSavingBySection] = useState<Record<string, boolean>>({});
  const [sendingBySection, setSendingBySection] = useState<Record<string, boolean>>({});

  const initialBySectionId = useMemo(() => {
    return new Map(initialSections.map((section) => [section.preparednessId, section]));
  }, [initialSections]);

  const initialTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of initialSections) {
      for (const task of section.tasks) {
        if (task.persisted) map.set(task.id, task.title.trim());
      }
    }
    return map;
  }, [initialSections]);

  const loadPreparedness = async () => {
    setIsLoading(true);
    try {
      const payload = await requestJson('/api/preparedness-with-tasks', { cache: 'no-store' });
      const apiRole = payload?.role as PreparednessApiRole;
      if (apiRole !== 'super-admin' && apiRole !== 'sub-admin') {
        throw new Error('Only super-admin and sub-admin can access this editor.');
      }

      const nextSections = toUiSections(payload.data ?? []);

      setRole(apiRole);
      setSections(nextSections);
      setInitialSections(nextSections);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load preparedness data.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPreparedness();
  }, []);

  const updateTaskTitle = (sectionId: string, taskId: string, title: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.preparednessId !== sectionId
          ? section
          : {
              ...section,
              tasks: section.tasks.map((task) => (task.id === taskId ? { ...task, title } : task)),
            }
      )
    );
  };

  const addTask = (sectionId: string, title: string) => {
    const cleanedTitle = title.trim();
    if (!cleanedTitle) return;
    setSections((prev) =>
      prev.map((section) =>
        section.preparednessId !== sectionId
          ? section
          : {
              ...section,
              tasks: [...section.tasks, { id: makeTempId(), title: cleanedTitle, persisted: false }],
            }
      )
    );
  };

  const deleteTask = (sectionId: string, taskId: string) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.preparednessId !== sectionId) return section;
        return { ...section, tasks: section.tasks.filter((row) => row.id !== taskId) };
      })
    );
  };

  const isSectionDirty = (section: PreparednessUiSection) => {
    const initial = initialBySectionId.get(section.preparednessId);
    if (!initial) return false;

    const initialTaskIds = new Set(initial.tasks.map((task) => task.id));
    const currentTaskIds = new Set(section.tasks.map((task) => task.id));
    if (initialTaskIds.size !== currentTaskIds.size) return true;
    for (const id of initialTaskIds) if (!currentTaskIds.has(id)) return true;

    const initialTitleMap = new Map(initial.tasks.map((task) => [task.id, task.title.trim()]));
    for (const task of section.tasks) {
      if (!task.persisted) return true;
      const initialTitle = initialTitleMap.get(task.id);
      if (initialTitle !== task.title.trim()) return true;
    }
    return false;
  };

  const handleSaveSection = async (sectionId: string) => {
    if (!role) return;
    const baseUrl =
      role === 'super-admin' ? '/api/admin/preparedness-tasks' : '/api/subadmin/preparedness-tasks';
    const section = sections.find((row) => row.preparednessId === sectionId);
    const initial = initialBySectionId.get(sectionId);
    if (!section || !initial) return;

    const creates: Array<{ preparednessId: string; title: string }> = [];
    const updates: Array<{ taskId: string; title: string }> = [];

    for (const task of section.tasks) {
      const title = task.title.trim();
      if (!title) continue;
      if (!task.persisted) {
        creates.push({ preparednessId: section.preparednessId, title });
        continue;
      }
      const originalTitle = initialTitleById.get(task.id);
      if (originalTitle !== undefined && originalTitle !== title) {
        updates.push({ taskId: task.id, title });
      }
    }

    const currentTaskIdSet = new Set(section.tasks.map((task) => task.id));
    const deleteIds = initial.tasks.filter((task) => !currentTaskIdSet.has(task.id)).map((task) => task.id);

    if (creates.length === 0 && updates.length === 0 && deleteIds.length === 0) {
      toast.info(`No changes to save for ${section.label}.`);
      return;
    }

    setSavingBySection((prev) => ({ ...prev, [sectionId]: true }));
    try {
      if (creates.length > 0) {
        await requestJson(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: creates }),
        });
      }

      if (updates.length > 0) {
        await requestJson(baseUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });
      }

      if (deleteIds.length > 0) {
        await requestJson(baseUrl, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds: deleteIds }),
        });
      }

      await loadPreparedness();
      toast.success(`Saved ${section.label}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save changes.';
      toast.error(message);
    } finally {
      setSavingBySection((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  const handleSendSection = async (sectionId: string) => {
    if (!role) return;
    const section = sections.find((row) => row.preparednessId === sectionId);
    if (!section) return;
    if (isSectionDirty(section)) {
      toast.error(`Save ${section.label} changes before sending.`);
      return;
    }

    const taskIds = section.tasks.filter((task) => task.persisted && task.title.trim()).map((task) => task.id);

    if (taskIds.length === 0) {
      toast.error(`No saved tasks available to send for ${section.label}.`);
      return;
    }

    const sendUrl =
      role === 'super-admin'
        ? '/api/admin/preparedness-tasks/send'
        : '/api/subadmin/preparedness-tasks/send';

    setSendingBySection((prev) => ({ ...prev, [sectionId]: true }));
    try {
      await requestJson(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });
      toast.success(
        role === 'super-admin' ? `${section.label} sent to sub-admins.` : `${section.label} sent to users.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send tasks.';
      toast.error(message);
    } finally {
      setSendingBySection((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  return (
    <AdminPageShell>
        <AdminPageHeader
          title="Preparedness Information"
          titleUppercase={false}
          description="Edit preparedness tasks by category and dispatch them through role-based workflows."
          actions={
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-500/10 px-3 py-1 text-[11px] font-bold text-red-700">
              <ShieldCheck className="h-4 w-4" />
              {role === 'super-admin' ? 'Super Admin Mode' : role === 'sub-admin' ? 'Sub Admin Mode' : 'Loading...'}
            </div>
          }
        />

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#33375D]" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {sections.map((section) => (
                <TaskSectionCard
                  key={section.preparednessId}
                  title={section.label}
                  category={section.category}
                  tasks={section.tasks}
                  headerIcon={getCategoryIcon(section.category)}
                  showActions
                  isDirty={isSectionDirty(section)}
                  isSaving={Boolean(savingBySection[section.preparednessId])}
                  isSending={Boolean(sendingBySection[section.preparednessId])}
                  saveLabel="Save Changes"
                  sendLabel={role === 'super-admin' ? 'Send to Sub Admin' : 'Send to Users'}
                  onAddTask={(title) => addTask(section.preparednessId, title)}
                  onTaskChange={(taskId, title) => updateTaskTitle(section.preparednessId, taskId, title)}
                  onTaskDelete={(taskId) => deleteTask(section.preparednessId, taskId)}
                  onSave={() => handleSaveSection(section.preparednessId)}
                  onSend={() => handleSendSection(section.preparednessId)}
                />
              ))}
            </div>
          </>
        )}
    </AdminPageShell>
  );
}
