import { useMemo } from 'react';
import { DateTime } from 'luxon';
import { buildRRule, describeRRule, type RecurrenceInput } from '@/lib/recurrence';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RecurrenceBuilder(props: {
  value: RecurrenceInput;
  onChange: (next: RecurrenceInput) => void;
  anchorDate: string; // YYYY-MM-DD
  zone: string;
}) {
  const { value, onChange, anchorDate, zone } = props;

  const previewRule = useMemo(() => {
    try {
      const anchor = DateTime.fromISO(anchorDate, { zone });
      return buildRRule(value, anchor);
    } catch {
      return '';
    }
  }, [value, anchorDate, zone]);

  const previewText = useMemo(() => {
    if (!previewRule) return '';
    const anchor = DateTime.fromISO(anchorDate, { zone }).toUTC();
    return describeRRule(previewRule, anchor.toISO() ?? new Date().toISOString());
  }, [previewRule, anchorDate, zone]);

  return (
    <div className="space-y-3 rounded-md border border-slate-700 bg-slate-900/60 p-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-300">Every</label>
        <input
          type="number"
          min={1}
          value={value.interval}
          onChange={(e) => onChange({ ...value, interval: Number(e.target.value) || 1 })}
          className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
        />
        <select
          value={value.freq}
          onChange={(e) => onChange({ ...value, freq: e.target.value as RecurrenceInput['freq'] })}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
        >
          <option value="DAILY">day(s)</option>
          <option value="WEEKLY">week(s)</option>
          <option value="MONTHLY">month(s)</option>
          <option value="YEARLY">year(s)</option>
        </select>
      </div>

      {value.freq === 'WEEKLY' && (
        <div>
          <div className="mb-1 text-sm text-slate-300">On days</div>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_LABELS.map((lbl, i) => {
              const on = value.byWeekday?.includes(i) ?? false;
              return (
                <button
                  type="button"
                  key={lbl}
                  onClick={() => {
                    const set = new Set(value.byWeekday ?? []);
                    if (set.has(i)) set.delete(i);
                    else set.add(i);
                    onChange({ ...value, byWeekday: Array.from(set).sort() });
                  }}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    on
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.freq === 'MONTHLY' && (
        <div className="space-y-2">
          <div className="text-sm text-slate-300">On day of month</div>
          <input
            type="text"
            placeholder="e.g. 1,15"
            value={value.byMonthDay?.join(',') ?? ''}
            onChange={(e) => {
              const days = e.target.value
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => n >= 1 && n <= 31);
              onChange({ ...value, byMonthDay: days.length ? days : undefined });
            }}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
        </div>
      )}

      <div>
        <div className="mb-1 text-sm text-slate-300">Ends</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={value.end.type}
            onChange={(e) => {
              const t = e.target.value as 'never' | 'until' | 'count';
              if (t === 'never') onChange({ ...value, end: { type: 'never' } });
              else if (t === 'until')
                onChange({ ...value, end: { type: 'until', date: anchorDate } });
              else onChange({ ...value, end: { type: 'count', count: 10 } });
            }}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          >
            <option value="never">Never</option>
            <option value="until">On date</option>
            <option value="count">After N times</option>
          </select>
          {value.end.type === 'until' && (
            <input
              type="date"
              value={value.end.date}
              onChange={(e) => onChange({ ...value, end: { type: 'until', date: e.target.value } })}
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
          )}
          {value.end.type === 'count' && (
            <input
              type="number"
              min={1}
              value={value.end.count}
              onChange={(e) =>
                onChange({
                  ...value,
                  end: { type: 'count', count: Math.max(1, Number(e.target.value) || 1) },
                })
              }
              className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
            />
          )}
        </div>
      </div>

      <div className="rounded-md bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
        {previewText || 'Configure a recurrence above.'}
      </div>
    </div>
  );
}

export function defaultRecurrence(anchorDate: string): RecurrenceInput {
  const wd = (DateTime.fromISO(anchorDate).weekday - 1) % 7; // 0..6 Mon..Sun
  return {
    freq: 'WEEKLY',
    interval: 1,
    byWeekday: [wd],
    end: { type: 'never' },
  };
}
