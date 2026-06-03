import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import {
  useDeleteTaskAll,
  useDeleteThisAndFuture,
  useEditAll,
  useEditThisAndFuture,
  useOverrideOccurrence,
  useSkipOccurrence,
} from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';
import { useLists } from '@/hooks/useLists';
import { EditScopeDialog, type EditScope } from './EditScopeDialog';
import { PrintButton } from '@/components/print/PrintButton';
import { RecurrenceBuilder, defaultRecurrence } from '@/components/recurrence/RecurrenceBuilder';
import { buildRRule, parseRRule, type RecurrenceInput } from '@/lib/recurrence';
import type { OccurrenceWithTask } from '@/types/db';

interface Props {
  occurrence: OccurrenceWithTask;
  onClose: () => void;
}

export function OccurrenceDetail({ occurrence, onClose }: Props) {
  const zone = useTimezone();
  const { data: lists } = useLists();
  const overrideOnce = useOverrideOccurrence();
  const skipOnce = useSkipOccurrence();
  const editAll = useEditAll();
  const editFuture = useEditThisAndFuture();
  const deleteAll = useDeleteTaskAll();
  const deleteFuture = useDeleteThisAndFuture();

  const task = occurrence.task;
  const [title, setTitle] = useState(occurrence.override_title ?? task.title);
  const [notes, setNotes] = useState(occurrence.override_notes ?? task.notes ?? '');
  const [time, setTime] = useState(occurrence.override_time ?? task.due_time ?? '');
  const [listId, setListId] = useState<string>(task.list_id ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceInput>(
    () => parseRRule(task.rrule) ?? defaultRecurrence(occurrence.occurrence_date),
  );

  const [scope, setScope] = useState<{ open: boolean; mode: 'edit' | 'delete' } | null>(null);

  const isOneOff = !task.is_recurring;
  const recurrencePreview = useMemo(() => {
    if (!task.is_recurring) return null;
    const anchor = DateTime.fromISO(occurrence.occurrence_date, { zone });
    try {
      return buildRRule(recurrence, anchor);
    } catch {
      return null;
    }
  }, [recurrence, occurrence.occurrence_date, zone, task.is_recurring]);

  async function applyEdit(picked: EditScope) {
    setScope(null);
    if (picked === 'one') {
      await overrideOnce.mutateAsync({
        id: occurrence.id,
        override_title: title !== task.title ? title : null,
        override_notes: notes !== (task.notes ?? '') ? notes : null,
        override_time: time !== (task.due_time ?? '') ? time || null : null,
      });
    } else if (picked === 'future') {
      await editFuture.mutateAsync({
        task_id: task.id,
        boundary_date: occurrence.occurrence_date,
        title,
        notes,
        list_id: listId || null,
        time: time || null,
        rrule: recurrencePreview,
      });
    } else {
      await editAll.mutateAsync({
        task_id: task.id,
        title,
        notes,
        list_id: listId || null,
        time: time || null,
        rrule: recurrencePreview,
      });
    }
    onClose();
  }

  async function applyDelete(picked: EditScope) {
    setScope(null);
    if (picked === 'one') {
      await skipOnce.mutateAsync(occurrence.id);
    } else if (picked === 'future') {
      await deleteFuture.mutateAsync({
        task_id: task.id,
        boundary_date: occurrence.occurrence_date,
      });
    } else {
      await deleteAll.mutateAsync(task.id);
    }
    onClose();
  }

  function onSave() {
    if (isOneOff) {
      // Treat as "all" — there's only one occurrence.
      void editAll.mutateAsync({
        task_id: task.id,
        title,
        notes,
        list_id: listId || null,
        time: time || null,
      }).then(onClose);
      return;
    }
    setScope({ open: true, mode: 'edit' });
  }

  function onDelete() {
    if (isOneOff) {
      void deleteAll.mutateAsync(task.id).then(onClose);
      return;
    }
    setScope({ open: true, mode: 'delete' });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4">
      <div className="w-full max-w-lg rounded-t-lg border border-slate-700 bg-slate-900 p-4 md:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-300">Time</span>
              <input
                type="time"
                value={time ?? ''}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-300">List</span>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
              >
                <option value="">— None —</option>
                {lists?.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
          </div>
          {task.is_recurring && (
            <RecurrenceBuilder
              value={recurrence}
              onChange={setRecurrence}
              anchorDate={occurrence.occurrence_date}
              zone={zone}
            />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onDelete}
              className="rounded-md border border-rose-800 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-950"
            >
              Delete
            </button>
            <PrintButton
              request={{ type: 'occurrence', occurrence_id: occurrence.id }}
              label="Print ticket"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
      <EditScopeDialog
        open={!!scope?.open}
        mode={scope?.mode ?? 'edit'}
        onPick={(s) => (scope?.mode === 'delete' ? applyDelete(s) : applyEdit(s))}
        onCancel={() => setScope(null)}
      />
    </div>
  );
}
