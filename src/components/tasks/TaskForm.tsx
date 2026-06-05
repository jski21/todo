import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { useLists } from '@/hooks/useLists';
import { useCreateTask } from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';
import { RecurrenceBuilder, defaultRecurrence } from '@/components/recurrence/RecurrenceBuilder';
import { buildRRule, type RecurrenceInput } from '@/lib/recurrence';

interface Props {
  /** YYYY-MM-DD to pre-fill the date field. If undefined, defaults to today.
   *  Pass an empty string to leave the date blank (creates a someday task). */
  initialDate?: string;
  /** Pre-select a list. Used when opening from the Lists page. */
  initialListId?: string | null;
  onClose: () => void;
}

export function TaskForm({ initialDate, initialListId, onClose }: Props) {
  const zone = useTimezone();
  const { data: lists } = useLists();
  const createTask = useCreateTask();
  const today = useMemo(() => DateTime.now().setZone(zone).toISODate() ?? '', [zone]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  // initialDate === '' means "intentionally blank" → someday.
  // initialDate === undefined means "use today".
  const [date, setDate] = useState(initialDate ?? today);
  const [time, setTime] = useState('');
  const [listId, setListId] = useState<string>(initialListId ?? '');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceInput>(() =>
    defaultRecurrence(initialDate || today),
  );

  // Recurring tasks need an anchor date — auto-off when the date is cleared.
  useEffect(() => {
    if (!date && isRecurring) setIsRecurring(false);
  }, [date, isRecurring]);

  const someday = !date;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let rrule: string | null = null;
    if (isRecurring && date) {
      const anchor = DateTime.fromISO(date, { zone });
      rrule = buildRRule(recurrence, anchor);
    }
    await createTask.mutateAsync({
      title: title.trim(),
      notes: notes.trim() || null,
      list_id: listId || null,
      date: date || undefined,
      time: time || null,
      is_recurring: isRecurring && !!date,
      rrule,
      is_someday: someday,
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
          <span className="mb-1 flex items-center justify-between text-slate-300">
            <span>Date</span>
            {date && (
              <button
                type="button"
                onClick={() => setDate('')}
                className="text-xs text-slate-500 hover:text-slate-200"
                title="Clear date (someday)"
              >
                clear
              </button>
            )}
          </span>
          <input
            type="date"
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
            disabled={!date}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
      </div>
      {someday && (
        <p className="text-xs text-slate-500">
          No date — this task lands in its list under <span className="text-slate-300">Someday</span>{' '}
          and won’t appear on Today or the Calendar.
        </p>
      )}
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
          disabled={!date}
          onChange={(e) => setIsRecurring(e.target.checked)}
        />
        <span className={!date ? 'opacity-50' : ''}>
          Recurring{!date && ' (set a date first)'}
        </span>
      </label>
      {isRecurring && date && (
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
          disabled={createTask.isPending || !title.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {createTask.isPending ? 'Saving…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
