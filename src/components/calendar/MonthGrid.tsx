import { DateTime } from 'luxon';
import { monthGrid } from '@/lib/dates';
import type { OccurrenceWithTask } from '@/types/db';

interface Props {
  anchor: DateTime;
  occurrencesByDate: Map<string, OccurrenceWithTask[]>;
  selectedDate?: string;
  onSelectDate: (date: string) => void;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthGrid({ anchor, occurrencesByDate, selectedDate, onSelectDate }: Props) {
  const cells = monthGrid(anchor);
  const todayKey = DateTime.now().setZone(anchor.zoneName ?? 'utc').toISODate();

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-slate-800 text-xs text-slate-400">
        {DOW.map((d) => (
          <div key={d} className="px-2 py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px bg-slate-800">
        {cells.map((cell) => {
          const key = cell.toISODate() ?? '';
          const inMonth = cell.month === anchor.month;
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const occ = occurrencesByDate.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={`flex min-h-[5rem] flex-col items-stretch gap-0.5 p-1 text-left transition ${
                inMonth ? 'bg-slate-950' : 'bg-slate-950/40 text-slate-600'
              } ${isSelected ? 'ring-2 ring-brand-500 ring-inset' : ''} hover:bg-slate-900`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday ? 'bg-brand-600 text-white' : inMonth ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {cell.day}
                </span>
                {occ.length > 3 && (
                  <span className="text-[10px] text-slate-500">+{occ.length - 3}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {occ.slice(0, 3).map((o) => {
                  const done = o.status === 'done';
                  return (
                    <div
                      key={o.id}
                      className={`truncate rounded px-1 py-0.5 text-[11px] ${
                        done
                          ? 'bg-slate-800/60 text-slate-500 line-through'
                          : 'bg-brand-600/30 text-brand-100'
                      }`}
                      title={o.override_title ?? o.task.title}
                    >
                      {o.override_title ?? o.task.title}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
