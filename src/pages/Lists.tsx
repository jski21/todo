import { useMemo, useState } from 'react';
import { useCreateList, useDeleteList, useLists, useUpdateList } from '@/hooks/useLists';
import { useOccurrences } from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';
import { DateTime } from 'luxon';
import { TaskItem } from '@/components/tasks/TaskItem';
import { OccurrenceDetail } from '@/components/tasks/OccurrenceDetail';
import type { OccurrenceWithTask } from '@/types/db';

export function ListsPage() {
  const zone = useTimezone();
  const { data: lists = [] } = useLists();
  const createList = useCreateList();
  const updateList = useUpdateList();
  const deleteList = useDeleteList();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selected, setSelected] = useState<OccurrenceWithTask | null>(null);

  const start = useMemo(
    () => DateTime.now().setZone(zone).minus({ days: 14 }).toISODate() ?? '',
    [zone],
  );
  const end = useMemo(
    () => DateTime.now().setZone(zone).plus({ days: 60 }).toISODate() ?? '',
    [zone],
  );
  const { data: occurrences = [] } = useOccurrences(start, end);

  const filtered = activeId
    ? occurrences.filter((o) => o.task.list_id === activeId)
    : occurrences.filter((o) => o.task.list_id == null);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[260px_1fr]">
      <aside className="border-b border-slate-800 p-3 md:border-b-0 md:border-r">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Lists</h2>
        <button
          onClick={() => setActiveId(null)}
          className={`mb-1 block w-full rounded-md px-2 py-1.5 text-left text-sm ${
            activeId == null ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          Inbox (no list)
        </button>
        {lists.map((l) => (
          <div key={l.id} className="group flex items-center gap-1">
            <button
              onClick={() => setActiveId(l.id)}
              className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${
                activeId === l.id ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <span
                aria-hidden
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ background: l.color ?? '#0ea5e9' }}
              />
              {l.name}
            </button>
            <button
              onClick={() => {
                const next = prompt('Rename list', l.name);
                if (next && next.trim()) updateList.mutate({ id: l.id, name: next.trim() });
              }}
              className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-slate-200"
              title="Rename"
            >
              ✎
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete list "${l.name}"? Tasks will remain (unassigned).`)) {
                  deleteList.mutate(l.id);
                  if (activeId === l.id) setActiveId(null);
                }
              }}
              className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-rose-300"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
        <form
          className="mt-3 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            createList.mutate({ name, color: '#0ea5e9' });
            setNewName('');
          }}
        >
          <input
            placeholder="New list"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <button className="rounded-md bg-brand-600 px-2 py-1 text-sm text-white">+</button>
        </form>
      </aside>

      <section className="space-y-2 overflow-auto p-4">
        <h1 className="text-xl font-semibold">
          {activeId ? lists.find((l) => l.id === activeId)?.name ?? '' : 'Inbox'}
        </h1>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks.</p>
        ) : (
          filtered.map((o) => (
            <div key={o.id}>
              <div className="text-xs text-slate-500">
                {DateTime.fromISO(o.occurrence_date).toFormat('ccc, LLL d')}
              </div>
              <TaskItem occurrence={o} onClick={() => setSelected(o)} />
            </div>
          ))
        )}
      </section>

      {selected && <OccurrenceDetail occurrence={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
