'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Pencil, Plus, Save, Send, Trash2 } from 'lucide-react';
import type { PreparednessUiTask } from '@/lib/preparedness-tasks/client-types';
import type { ReactNode } from 'react';

type TaskSectionCardProps = {
  title: string;
  category: string;
  tasks: PreparednessUiTask[];
  headerIcon?: ReactNode;
  readOnly?: boolean;
  onTaskChange?: (taskId: string, title: string) => void;
  onTaskDelete?: (taskId: string) => void;
  onAddTask?: (title: string) => void;
  showActions?: boolean;
  saveLabel?: string;
  sendLabel?: string;
  onSave?: () => void;
  onSend?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  isSending?: boolean;
};

export function TaskSectionCard({
  title,
  category,
  tasks,
  headerIcon,
  readOnly = false,
  onTaskChange,
  onTaskDelete,
  onAddTask,
  showActions = false,
  saveLabel = 'Save Changes',
  sendLabel = 'Send',
  onSave,
  onSend,
  isDirty = false,
  isSaving = false,
  isSending = false,
}: TaskSectionCardProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);

  const handleAddTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    onAddTask?.(title);
    setNewTaskTitle('');
  };

  const isEditing = (taskId: string) => editingTaskId === taskId;

  const pendingDeleteTask = pendingDeleteTaskId
    ? tasks.find((task) => task.id === pendingDeleteTaskId)
    : undefined;

  const handleConfirmDelete = () => {
    const id = pendingDeleteTaskId;
    setPendingDeleteTaskId(null);
    if (id) onTaskDelete?.(id);
  };

  return (
    <Card className="p-8 border-slate-200 rounded-2xl bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">{category}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-400">
          {headerIcon}
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((task, idx) => (
          <div key={task.id} className="flex items-center gap-3">
            <span className="text-slate-400 text-sm w-5">{idx + 1}.</span>
            {readOnly ? (
              <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {task.title}
              </div>
            ) : isEditing(task.id) ? (
              <Input
                value={task.title}
                onChange={(event) => onTaskChange?.(task.id, event.target.value)}
                className="flex-1 bg-slate-50 border-slate-100 rounded-md h-10"
                autoFocus
              />
            ) : (
              <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {task.title}
              </div>
            )}
            {!readOnly && (
              <>
                <Button
                  onClick={() => setEditingTaskId(isEditing(task.id) ? null : task.id)}
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
                  aria-label="Edit task"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => setPendingDeleteTaskId(task.id)}
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                  aria-label="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <p className="text-sm text-slate-400 py-2">
          {readOnly ? 'No tasks available in this category.' : 'No tasks yet. Add your first task.'}
        </p>
      )}

      {!readOnly && (
        <div className="mt-5 flex items-center gap-2">
          <Input
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="Add new task..."
            className="flex-1 bg-slate-50 border-slate-100 rounded-md h-10"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddTask();
              }
            }}
          />
          <Button
            onClick={handleAddTask}
            variant="ghost"
            size="icon"
            className="rounded-sm border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            aria-label="Add task"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}

      {showActions && !readOnly && (
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button
            onClick={onSave}
            disabled={!isDirty || isSaving || isSending}
            className="bg-[#33375D] hover:bg-[#2B2F50] text-white rounded-md"
            size="sm"
          >
            {isSaving ? (
              <span
                className="mr-2 inline-flex size-4 shrink-0 origin-center items-center justify-center motion-safe:animate-spin"
                aria-hidden
              >
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
            className="rounded-md border-slate-300"
            size="sm"
          >
            {isSending ? (
              <span
                className="mr-2 inline-flex size-4 shrink-0 origin-center items-center justify-center motion-safe:animate-spin"
                aria-hidden
              >
                <Loader2 className="size-4 shrink-0 text-[#33375D]" />
              </span>
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {sendLabel}
          </Button>
        </div>
      )}

      <AlertDialog
        open={pendingDeleteTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTaskId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTask?.title?.trim()
                ? `“${pendingDeleteTask.title.trim()}” will be removed from ${title}. You can save changes afterward.`
                : `This task will be removed from ${title}. You can save changes afterward.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 sm:order-last"
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
