import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { useLists } from '@/hooks/useLists';
import { useCreateTask } from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';
import { RecurrenceBuilder, defaultRecurrence } from '@/components/recurrence/RecurrenceBuilder';
import { buildRRule, type RecurrenceInput } from '@/lib/recurrence';

interface Props {
  initialDate?: string;
  onClose: () => void;
}

export function TaskForm({ initialDate, onClose }: Props) {
  const zone = useTimezone();
  const { data: lists } = useLists();
  const createTask = useCreateTask();
  const today = useMemo(() => DateTime.now().setZone(zone).toISODate() ?? '', [zone]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(initialDate ?? today);
  const [time, setTime] = useState('');
  const [listId, setListId] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceInput>(() => defaultRecurrence(initialDate ?? today));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let rrule: string | null = null;
    if (isRecurring) {
      const anchor = DateTime.fromISO(date, { zone });
      rrule = buildRRule(recurrence, anchor);
    }
    await createTask.mutateAsync({
      title: title.trim(),
      notes: notes.trim() || null,
      list_id: listId || null,
      date,
      time: time || null,
      is_recurring: isRecurring,
      rrule,
    });
    onClose();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        autoFocus
        required
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand-500 focus:outline-none"
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Date</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-300">Time (optional)</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">List</span>
        <select
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          <option value="">— No list —</option>
          {lists?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
        />
        Recurring
      </label>
      {isRecurring && (
        <RecurrenceBuilder
          value={recurrence}
          onChange={setRecurrence}
          anchorDate={date}
          zone={zone}
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createTask.isPending}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {createTask.isPending ? 'Saving…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
