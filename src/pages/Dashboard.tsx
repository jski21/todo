import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { useOccurrences } from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';
import { QuickAdd } from '@/components/tasks/QuickAdd';
import { TaskItem } from '@/components/tasks/TaskItem';
import { TaskForm } from '@/components/tasks/TaskForm';
import { OccurrenceDetail } from '@/components/tasks/OccurrenceDetail';
import { PrintButton } from '@/components/print/PrintButton';
import type { OccurrenceWithTask } from '@/types/db';

export function DashboardPage() {
  const zone = useTimezone();
  const today = useMemo(() => DateTime.now().setZone(zone).toISODate() ?? '', [zone]);
  const start = useMemo(
    () => DateTime.now().setZone(zone).minus({ days: 14 }).toISODate() ?? '',
    [zone],
  );
  const end = useMemo(
    () => DateTime.now().setZone(zone).plus({ days: 30 }).toISODate() ?? '',
    [zone],
  );

  const { data: occurrences = [], isLoading } = useOccurrences(start, end);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<OccurrenceWithTask | null>(null);

  const overdue = occurrences.filter(
    (o) => o.occurrence_date < today && o.status === 'pending',
  );
  const todays = occurrences.filter((o) => o.occurrence_date === today);
  const upcoming = occurrences.filter(
    (o) => o.occurrence_date > today && o.occurrence_date <= end,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-slate-400">
            {DateTime.now().setZone(zone).toFormat('cccc, LLLL d')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton request={{ type: 'daily' }} label="Print today" />
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New task
          </button>
        </div>
      </header>

      <QuickAdd defaultDate={today} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Overdue" value={overdue.length} tone="rose" />
        <Stat label="Today" value={todays.length} tone="brand" />
        <Stat label="Upcoming" value={upcoming.length} tone="slate" />
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}

      {overdue.length > 0 && (
        <Section title="Overdue">
          {overdue.map((o) => (
            <TaskItem key={o.id} occurrence={o} onClick={() => setSelected(o)} />
          ))}
        </Section>
      )}

      <Section title="Today">
        {todays.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing scheduled.</p>
        ) : (
          todays.map((o) => (
            <TaskItem key={o.id} occurrence={o} onClick={() => setSelected(o)} />
          ))
        )}
      </Section>

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.slice(0, 20).map((o) => (
            <div key={o.id} className="space-y-1">
              <div className="text-xs text-slate-500">
                {DateTime.fromISO(o.occurrence_date).toFormat('ccc, LLL d')}
              </div>
              <TaskItem occurrence={o} onClick={() => setSelected(o)} />
            </div>
          ))}
        </Section>
      )}

      {creating && (
        <Modal title="New task" onClose={() => setCreating(false)}>
          <TaskForm onClose={() => setCreating(false)} />
        </Modal>
      )}

      {selected && (
        <OccurrenceDetail
          occurrence={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'rose' | 'brand' | 'slate' }) {
  const toneCls =
    tone === 'rose'
      ? 'border-rose-900 bg-rose-950/30 text-rose-200'
      : tone === 'brand'
        ? 'border-brand-700 bg-brand-600/20 text-brand-100'
        : 'border-slate-800 bg-slate-900 text-slate-200';
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4">
      <div className="w-full max-w-lg rounded-t-lg border border-slate-700 bg-slate-900 p-4 md:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
