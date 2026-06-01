import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { useOccurrences } from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';
import { monthGrid } from '@/lib/dates';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { TaskItem } from '@/components/tasks/TaskItem';
import { TaskForm } from '@/components/tasks/TaskForm';
import { OccurrenceDetail } from '@/components/tasks/OccurrenceDetail';
import type { OccurrenceWithTask } from '@/types/db';

export function CalendarPage() {
  const zone = useTimezone();
  const [anchor, setAnchor] = useState<DateTime>(DateTime.now().setZone(zone).startOf('month'));
  const [view, setView] = useState<'month' | 'week'>('month');
  const [selectedDate, setSelectedDate] = useState<string | undefined>(
    DateTime.now().setZone(zone).toISODate() ?? undefined,
  );
  const [creating, setCreating] = useState(false);
  const [selectedOcc, setSelectedOcc] = useState<OccurrenceWithTask | null>(null);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      const cells = monthGrid(anchor);
      return {
        rangeStart: cells[0].toISODate() ?? '',
        rangeEnd: cells[cells.length - 1].toISODate() ?? '',
      };
    }
    const weekStart = anchor.startOf('week').minus({ days: 1 }); // Sunday-start
    return {
      rangeStart: weekStart.toISODate() ?? '',
      rangeEnd: weekStart.plus({ days: 6 }).toISODate() ?? '',
    };
  }, [anchor, view]);

  const { data: occurrences = [] } = useOccurrences(rangeStart, rangeEnd);

  const byDate = useMemo(() => {
    const m = new Map<string, OccurrenceWithTask[]>();
    for (const o of occurrences) {
      const arr = m.get(o.occurrence_date) ?? [];
      arr.push(o);
      m.set(o.occurrence_date, arr);
    }
    return m;
  }, [occurrences]);

  const dayOccurrences = selectedDate ? byDate.get(selectedDate) ?? [] : [];

  return (
    <div className="flex h-full flex-col p-3 md:p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor((a) => a.minus({ [view === 'month' ? 'months' : 'weeks']: 1 }))}
            className="rounded-md border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800"
          >
            ‹
          </button>
          <h1 className="text-lg font-semibold">
            {view === 'month'
              ? anchor.toFormat('LLLL yyyy')
              : `${anchor.startOf('week').minus({ days: 1 }).toFormat('LLL d')} – ${anchor
                  .startOf('week')
                  .minus({ days: 1 })
                  .plus({ days: 6 })
                  .toFormat('LLL d')}`}
          </h1>
          <button
            onClick={() => setAnchor((a) => a.plus({ [view === 'month' ? 'months' : 'weeks']: 1 }))}
            className="rounded-md border border-slate-700 px-2 py-1 text-sm hover:bg-slate-800"
          >
            ›
          </button>
          <button
            onClick={() => setAnchor(DateTime.now().setZone(zone).startOf('month'))}
            className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-slate-700">
            <button
              onClick={() => setView('month')}
              className={`px-2 py-1 text-xs ${view === 'month' ? 'bg-brand-600 text-white' : 'text-slate-300'}`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-2 py-1 text-xs ${view === 'week' ? 'bg-brand-600 text-white' : 'text-slate-300'}`}
            >
              Week
            </button>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[1fr_320px]">
        <div className="min-h-[28rem]">
          {view === 'month' ? (
            <MonthGrid
              anchor={anchor}
              occurrencesByDate={byDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          ) : (
            <WeekView
              anchor={anchor}
              occurrencesByDate={byDate}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          )}
        </div>
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-800 bg-slate-900/40">
          <div className="border-b border-slate-800 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Day</div>
            <div className="text-base font-semibold">
              {selectedDate ? DateTime.fromISO(selectedDate).toFormat('cccc, LLL d') : '—'}
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-auto p-3">
            {dayOccurrences.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks.</p>
            ) : (
              dayOccurrences.map((o) => (
                <TaskItem key={o.id} occurrence={o} onClick={() => setSelectedOcc(o)} />
              ))
            )}
          </div>
          <div className="border-t border-slate-800 p-3">
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              + Add to this day
            </button>
          </div>
        </aside>
      </div>

      {creating && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4">
          <div className="w-full max-w-lg rounded-t-lg border border-slate-700 bg-slate-900 p-4 md:rounded-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New task</h2>
              <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <TaskForm initialDate={selectedDate} onClose={() => setCreating(false)} />
          </div>
        </div>
      )}

      {selectedOcc && (
        <OccurrenceDetail occurrence={selectedOcc} onClose={() => setSelectedOcc(null)} />
      )}
    </div>
  );
}

function WeekView({
  anchor,
  occurrencesByDate,
  selectedDate,
  onSelectDate,
}: {
  anchor: DateTime;
  occurrencesByDate: Map<string, OccurrenceWithTask[]>;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
}) {
  const weekStart = anchor.startOf('week').minus({ days: 1 }); // Sunday
  const days = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  return (
    <div className="grid h-full grid-cols-7 gap-px bg-slate-800">
      {days.map((d) => {
        const key = d.toISODate() ?? '';
        const occ = occurrencesByDate.get(key) ?? [];
        const isSelected = key === selectedDate;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDate(key)}
            className={`flex flex-col items-stretch gap-1 bg-slate-950 p-2 text-left ${
              isSelected ? 'ring-2 ring-brand-500 ring-inset' : ''
            }`}
          >
            <div className="text-xs text-slate-400">{d.toFormat('ccc')}</div>
            <div className="text-lg font-semibold">{d.day}</div>
            <div className="flex flex-col gap-0.5">
              {occ.slice(0, 6).map((o) => (
                <div
                  key={o.id}
                  className={`truncate rounded px-1 py-0.5 text-[11px] ${
                    o.status === 'done'
                      ? 'bg-slate-800/60 text-slate-500 line-through'
                      : 'bg-brand-600/30 text-brand-100'
                  }`}
                >
                  {o.override_title ?? o.task.title}
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
