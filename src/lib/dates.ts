import { DateTime } from 'luxon';

export function toLocal(iso: string | Date, zone: string): DateTime {
  if (iso instanceof Date) return DateTime.fromJSDate(iso, { zone });
  return DateTime.fromISO(iso, { zone });
}

export function toUtcIso(dt: DateTime): string {
  return dt.toUTC().toISO() ?? '';
}

export function localDateKey(iso: string, zone: string): string {
  return toLocal(iso, zone).toISODate() ?? '';
}

export function todayKey(zone: string): string {
  return DateTime.now().setZone(zone).toISODate() ?? '';
}

export function startOfMonth(date: DateTime): DateTime {
  return date.startOf('month');
}

export function endOfMonth(date: DateTime): DateTime {
  return date.endOf('month');
}

/**
 * Build a 6-row month grid (always 42 cells) for a given anchor date in a given zone.
 * Week starts on Sunday.
 */
export function monthGrid(anchor: DateTime): DateTime[] {
  const first = anchor.startOf('month');
  const startWeekday = first.weekday % 7; // luxon: Mon=1..Sun=7; we want Sun=0
  const gridStart = first.minus({ days: startWeekday });
  return Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
}

/**
 * Combine a local date (YYYY-MM-DD) with an optional time (HH:mm or HH:mm:ss)
 * in the user's zone, returning UTC ISO. If no time, default to start-of-day.
 */
export function combineDateTimeUtc(
  date: string,
  time: string | null | undefined,
  zone: string,
): string {
  const [hh = '0', mm = '0', ss = '0'] = (time ?? '00:00:00').split(':');
  const dt = DateTime.fromISO(date, { zone }).set({
    hour: Number(hh),
    minute: Number(mm),
    second: Number(ss),
  });
  return dt.toUTC().toISO() ?? '';
}

export function formatTime12(time: string | null | undefined): string {
  if (!time) return '';
  const [h = '0', m = '0'] = time.split(':');
  const hour = Number(h);
  const period = hour >= 12 ? 'pm' : 'am';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m.padStart(2, '0')}${period}`;
}

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
