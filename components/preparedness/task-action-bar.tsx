'use client';

import { Button } from '@/components/ui/button';
import { Loader2, Save, Send } from 'lucide-react';

type TaskActionBarProps = {
  isDirty: boolean;
  isSaving: boolean;
  isSending: boolean;
  saveLabel: string;
  sendLabel: string;
  onSave: () => void;
  onSend: () => void;
};

export function TaskActionBar({
  isDirty,
  isSaving,
  isSending,
  saveLabel,
  sendLabel,
  onSave,
  onSend,
}: TaskActionBarProps) {
  return (
    <div className="sticky bottom-4 z-20">
      <div className="bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg rounded-2xl px-4 py-3 flex flex-wrap items-center justify-end gap-3">
        <Button
          onClick={onSave}
          disabled={!isDirty || isSaving || isSending}
          className="bg-[#33375D] hover:bg-[#2B2F50] text-white rounded-xl"
        >
          {isSaving ? (
            <span className="mr-2 inline-flex size-4 shrink-0 origin-center items-center justify-center motion-safe:animate-spin" aria-hidden>
              <Loader2 className="size-4 shrink-0 text-white" />
            </span>
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {saveLabel}
        </Button>
        <Button
          onClick={onSend}
          disabled={isDirty || isSaving || isSending}
          variant="outline"
          className="rounded-xl border-slate-300"
        >
          {isSending ? (
            <span className="mr-2 inline-flex size-4 shrink-0 origin-center items-center justify-center motion-safe:animate-spin" aria-hidden>
              <Loader2 className="size-4 shrink-0 text-[#33375D]" />
            </span>
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {sendLabel}
        </Button>
      </div>
    </div>
  );
}
