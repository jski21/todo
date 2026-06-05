import { RRule, RRuleSet, rrulestr, Frequency, Weekday } from 'rrule';
import { DateTime } from 'luxon';
import { supabase } from './supabase';
import type { Task, TaskOccurrence } from '@/types/db';
import { combineDateTimeUtc } from './dates';

export type FreqKey = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceInput {
  freq: FreqKey;
  interval: number;
  byWeekday?: number[]; // 0=Mon..6=Sun (rrule convention)
  byMonthDay?: number[];
  bySetPos?: number; // for nth-weekday of month, with byWeekday length 1
  end: { type: 'never' } | { type: 'until'; date: string /* YYYY-MM-DD */ } | { type: 'count'; count: number };
}

const FREQ_MAP: Record<FreqKey, Frequency> = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY,
};

const WEEKDAYS: Weekday[] = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU];

/**
 * Build an RRULE string (without DTSTART) from structured input. Dates are anchored
 * to dtstart elsewhere; rrule.js can parse the string and we feed dtstart in separately.
 */
export function buildRRule(input: RecurrenceInput, dtstartLocal: DateTime): string {
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    freq: FREQ_MAP[input.freq],
    interval: Math.max(1, input.interval),
    dtstart: dtstartLocal.toJSDate(),
  };

  if (input.byWeekday && input.byWeekday.length > 0) {
    options.byweekday = input.byWeekday.map((i) => WEEKDAYS[i]);
  }
  if (input.byMonthDay && input.byMonthDay.length > 0) {
    options.bymonthday = input.byMonthDay;
  }
  if (input.bySetPos != null) {
    options.bysetpos = [input.bySetPos];
  }
  if (input.end.type === 'until') {
    options.until = DateTime.fromISO(input.end.date, { zone: dtstartLocal.zoneName ?? 'utc' })
      .endOf('day')
      .toJSDate();
  } else if (input.end.type === 'count') {
    options.count = Math.max(1, input.end.count);
  }

  const rule = new RRule(options as ConstructorParameters<typeof RRule>[0]);
  // Strip DTSTART line — we store dtstart separately on the task row.
  return rule
    .toString()
    .split('\n')
    .filter((line) => !line.startsWith('DTSTART'))
    .join('\n')
    .replace(/^RRULE:/, '');
}

export function describeRRule(rrule: string | null, dtstart: string): string {
  if (!rrule) return 'Once';
  try {
    const full = `DTSTART:${DateTime.fromISO(dtstart).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")}\nRRULE:${rrule}`;
    return rrulestr(full).toText();
  } catch {
    return rrule;
  }
}

/**
 * Parse a stored RRULE string into structured form. Best-effort; unsupported
 * exotic fields fall back to defaults.
 */
export function parseRRule(rrule: string | null): RecurrenceInput | null {
  if (!rrule) return null;
  try {
    const rule = RRule.fromString(`RRULE:${rrule}`);
    const opts = rule.origOptions;
    const freqMap: Record<number, FreqKey> = {
      [RRule.DAILY]: 'DAILY',
      [RRule.WEEKLY]: 'WEEKLY',
      [RRule.MONTHLY]: 'MONTHLY',
      [RRule.YEARLY]: 'YEARLY',
    };
    const freq = freqMap[opts.freq as number] ?? 'WEEKLY';
    const byWeekday: number[] | undefined = Array.isArray(opts.byweekday)
      ? (opts.byweekday as Weekday[]).map((wd) => (typeof wd === 'number' ? wd : wd.weekday))
      : undefined;
    const byMonthDay: number[] | undefined = Array.isArray(opts.bymonthday)
      ? (opts.bymonthday as number[])
      : typeof opts.bymonthday === 'number'
        ? [opts.bymonthday]
        : undefined;
    let end: RecurrenceInput['end'] = { type: 'never' };
    if (opts.until) {
      end = { type: 'until', date: DateTime.fromJSDate(opts.until as Date).toISODate() ?? '' };
    } else if (opts.count) {
      end = { type: 'count', count: opts.count as number };
    }
    return {
      freq,
      interval: (opts.interval as number) ?? 1,
      byWeekday,
      byMonthDay,
      bySetPos: Array.isArray(opts.bysetpos) ? (opts.bysetpos[0] as number) : undefined,
      end,
    };
  } catch {
    return null;
  }
}

/**
 * Expand a task's RRULE into UTC Date occurrences within [rangeStart, rangeEnd].
 * Anchors the rule to the task's dtstart in the given local zone, so DST-safe.
 */
export function expandOccurrences(
  task: Task,
  rangeStart: Date,
  rangeEnd: Date,
  zone: string,
): Date[] {
  if (!task.is_recurring || !task.rrule) {
    const d = DateTime.fromISO(task.dtstart, { zone });
    if (d.toJSDate() >= rangeStart && d.toJSDate() <= rangeEnd) return [d.toJSDate()];
    return [];
  }
  try {
    const dtstartLocal = DateTime.fromISO(task.dtstart, { zone });
    const set = new RRuleSet();
    const rule = RRule.fromString(`RRULE:${task.rrule}`);
    const opts = { ...rule.origOptions, dtstart: dtstartLocal.toJSDate() };
    set.rrule(new RRule(opts as ConstructorParameters<typeof RRule>[0]));
    return set.between(rangeStart, rangeEnd, true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('expandOccurrences failed for task', task.id, err);
    return [];
  }
}

/**
 * Generate (upsert) occurrences for all active tasks across a date range.
 * Idempotent thanks to unique(task_id, occurrence_date).
 */
export async function generateOccurrences(
  userId: string,
  zone: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<void> {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('is_someday', false);
  if (error) throw error;
  if (!tasks || tasks.length === 0) return;

  const rows: Partial<TaskOccurrence>[] = [];
  for (const task of tasks as Task[]) {
    const dates = expandOccurrences(task, rangeStart, rangeEnd, zone);
    for (const d of dates) {
      const local = DateTime.fromJSDate(d, { zone });
      const occurrence_date = local.toISODate();
      if (!occurrence_date) continue;
      let scheduled_at: string | null = null;
      if (task.due_time) {
        scheduled_at = combineDateTimeUtc(occurrence_date, task.due_time, zone);
      } else if (!task.is_recurring) {
        scheduled_at = task.dtstart;
      }
      rows.push({
        user_id: userId,
        task_id: task.id,
        occurrence_date,
        scheduled_at,
      });
    }
  }
  if (rows.length === 0) return;

  // Upsert in batches; conflict on (task_id, occurrence_date) preserves existing
  // status/completed_at/is_exception/override_* fields by ignoring on conflict.
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error: upErr } = await supabase
      .from('task_occurrences')
      .upsert(slice, { onConflict: 'task_id,occurrence_date', ignoreDuplicates: true });
    if (upErr) throw upErr;
  }
}

/**
 * Apply an UNTIL clause to an existing RRULE string, ending it the day before `boundary`
 * in the given zone. Used by the "this and following" split.
 */
export function rruleWithUntil(rrule: string, boundaryLocalDate: string, zone: string): string {
  const until = DateTime.fromISO(boundaryLocalDate, { zone })
    .minus({ days: 1 })
    .endOf('day')
    .toUTC()
    .toFormat("yyyyLLdd'T'HHmmss'Z'");
  const parts = rrule.split(';').filter((p) => !p.startsWith('UNTIL=') && !p.startsWith('COUNT='));
  parts.push(`UNTIL=${until}`);
  return parts.join(';');
}
