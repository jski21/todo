import { useState } from 'react';
import {
  useCreateTask,
  useDeleteTaskAll,
  useRenameSomeday,
  useScheduleSomeday,
  useSomedayTasks,
} from '@/hooks/useTasks';
import type { Task } from '@/types/db';

interface Props {
  /** null = "Inbox" (no list); otherwise the list_id whose someday tasks we show. */
  listId: string | null;
}

export function SomedaySection({ listId }: Props) {
  const { data: tasks = [], isLoading } = useSomedayTasks(listId);
  const createTask = useCreateTask();
  const [newTitle, setNewTitle] = useState('');

  async function addQuick(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    await createTask.mutateAsync({
      title,
      list_id: listId,
      is_recurring: false,
      is_someday: true,
    });
    setNewTitle('');
  }

  return (
    <section className="space-y-2">
      <form onSubmit={addQuick} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task (no date) and press Enter…"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={createTask.isPending || !newTitle.trim()}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-slate-500">No someday tasks in this list.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <SomedayItem key={t.id} task={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SomedayItem({ task }: { task: Task }) {
  const rename = useRenameSomeday();
  const schedule = useScheduleSomeday();
  const del = useDeleteTaskAll();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');

  function saveRename() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== task.title) {
      rename.mutate({ task_id: task.id, title: next });
    } else {
      setTitle(task.title);
    }
  }

  async function applySchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    await schedule.mutateAsync({
      task_id: task.id,
      date,
      time: time || null,
    });
    setScheduling(false);
  }

  return (
    <li className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-start gap-2">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') {
                setTitle(task.title);
                setEditing(false);
              }
            }}
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm text-slate-100"
          >
            {task.title}
          </button>
        )}
        <button
          type="button"
          onClick={() => setScheduling((s) => !s)}
          className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
          title="Schedule"
        >
          {scheduling ? 'Cancel' : 'Schedule'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${task.title}"?`)) del.mutate(task.id);
          }}
          className="rounded text-xs text-slate-500 hover:text-rose-400"
          title="Delete"
        >
          ✕
        </button>
      </div>

      {scheduling && (
        <form onSubmit={applySchedule} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="mb-0.5 block text-slate-400">Date</span>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block text-slate-400">Time</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={schedule.isPending || !date}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            {schedule.isPending ? 'Saving…' : 'Schedule'}
          </button>
        </form>
      )}
    </li>
  );
}
