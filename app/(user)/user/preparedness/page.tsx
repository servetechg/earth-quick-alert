'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Globe,
  Loader2,
  MapPin,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { TaskSectionCard } from '@/components/preparedness/task-section-card';
import type { PreparednessApiGroup, PreparednessUiSection } from '@/lib/preparedness-tasks/client-types';
import {
  getPreparednessCategoryLabel,
  sortPreparednessCategories,
} from '@/lib/preparedness-tasks/category-labels';

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

async function loadPreparednessForUser() {
  const response = await fetch('/api/preparedness-with-tasks', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || 'Failed to load preparedness tasks.');
  }
  return payload;
}

export default function PreparednessPage() {
  const [sections, setSections] = useState<PreparednessUiSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      try {
        const payload = await loadPreparednessForUser();
        setSections(toUiSections(payload.data ?? []));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load preparedness guides.';
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <Card className="p-8 border-slate-200 rounded-2xl shadow-sm relative overflow-hidden bg-white">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#33375D]" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Preparedness Guide</h1>
              <p className="text-slate-500 font-medium">
                Review preparedness tasks grouped by category. This view is read-only.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-200 text-[11px] font-bold text-indigo-700">
              <ShieldCheck className="w-4 h-4" />
              User View
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#33375D]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {sections.map((section) => (
              <TaskSectionCard
                key={section.preparednessId}
                title={section.label}
                category={section.category}
                tasks={section.tasks}
                headerIcon={getCategoryIcon(section.category)}
                readOnly
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
