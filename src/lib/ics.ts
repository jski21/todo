// Browser ICS parser using ical.js (Mozilla). Extracts VEVENTs into a shape
// our tasks table understands: title, notes, dtstart (UTC ISO), rrule, uid.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ICAL from 'ical.js';

export interface ImportedEvent {
  uid: string;
  title: string;
  notes: string | null;
  /** UTC ISO timestamp anchored at the first occurrence. */
  dtstart: string;
  /** Local time HH:mm if the event has a time component, else null. */
  due_time: string | null;
  /** RRULE body without the "RRULE:" prefix, or null for one-off. */
  rrule: string | null;
  is_recurring: boolean;
  /** True if DTSTART;VALUE=DATE (all-day). */
  all_day: boolean;
}

export interface ParseResult {
  calendarName: string | null;
  events: ImportedEvent[];
  errors: string[];
}

export function parseIcs(text: string): ParseResult {
  const errors: string[] = [];
  let jcal: unknown;
  try {
    jcal = ICAL.parse(text);
  } catch (e) {
    return { calendarName: null, events: [], errors: [`Could not parse file: ${(e as Error).message}`] };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comp = new (ICAL as any).Component(jcal);
  const calendarName =
    (comp.getFirstPropertyValue('x-wr-calname') as string | null) ??
    (comp.getFirstPropertyValue('name') as string | null) ??
    null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vevents: any[] = comp.getAllSubcomponents('vevent');
  const events: ImportedEvent[] = [];
  for (const vevent of vevents) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = new (ICAL as any).Event(vevent);
      const uid: string | null = event.uid ?? null;
      const title: string = event.summary ?? '(untitled)';
      const description: string | null = event.description ?? null;

      // Skip recurrence-id overrides — they belong to a master event we'll keep.
      if (event.isRecurrenceException && event.isRecurrenceException()) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const startTime: any = event.startDate;
      if (!startTime) {
        errors.push(`Event "${title}" has no DTSTART; skipped.`);
        continue;
      }
      const allDay: boolean = !!startTime.isDate;
      const startJs: Date = startTime.toJSDate();
      const dtstart = startJs.toISOString();

      let due_time: string | null = null;
      if (!allDay) {
        const hh = String(startTime.hour).padStart(2, '0');
        const mm = String(startTime.minute).padStart(2, '0');
        due_time = `${hh}:${mm}`;
      }

      // RRULE — ical.js parses it into an ICAL.Recur; serialize back to string body.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rruleProp = vevent.getFirstPropertyValue('rrule') as any | null;
      let rrule: string | null = null;
      if (rruleProp) {
        const s = typeof rruleProp.toString === 'function' ? rruleProp.toString() : String(rruleProp);
        // ICAL.Recur#toString returns "FREQ=...;BYDAY=...". Strip any leading prefix.
        rrule = s.replace(/^RRULE:/i, '');
      }

      events.push({
        uid: uid ?? `${title}-${dtstart}`,
        title,
        notes: description,
        dtstart,
        due_time,
        rrule,
        is_recurring: !!rrule,
        all_day: allDay,
      });
    } catch (e) {
      errors.push(`Skipped event: ${(e as Error).message}`);
    }
  }
  return { calendarName, events, errors };
}
