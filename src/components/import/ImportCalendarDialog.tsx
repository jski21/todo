import { useState } from 'react';
import { parseIcs, type ImportedEvent } from '@/lib/ics';
import { useImportIcs } from '@/hooks/useImportIcs';

export function ImportCalendarDialog({ onClose }: { onClose: () => void }) {
  const importIcs = useImportIcs();
  const [filename, setFilename] = useState<string>('');
  const [listName, setListName] = useState('Imported calendar');
  const [events, setEvents] = useState<ImportedEvent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setParseError(null);
    setDone(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    const result = parseIcs(text);
    setEvents(result.events);
    setErrors(result.errors);
    if (result.calendarName) setListName(result.calendarName);
    else setListName(file.name.replace(/\.ics$/i, '') || 'Imported calendar');
    if (result.events.length === 0 && result.errors.length > 0) {
      setParseError(result.errors[0] ?? 'No events found.');
    }
  }

  async function onImport() {
    const source = /outlook/i.test(filename)
      ? 'outlook'
      : /google|gmail|calendar/i.test(filename)
        ? 'google'
        : 'ics';
    const res = await importIcs.mutateAsync({
      listName: listName.trim() || 'Imported calendar',
      source,
      events,
    });
    setDone({ inserted: res.inserted, skipped: res.skipped });
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4">
      <div className="w-full max-w-lg rounded-t-lg border border-slate-700 bg-slate-900 p-4 md:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import calendar</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        {!done ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">
              Export an .ics file from{' '}
              <span className="text-slate-200">Outlook</span> (File → Save Calendar) or{' '}
              <span className="text-slate-200">Google Calendar</span> (Settings → Import &amp; export → Export).
              All events go into a new list — recurring ones keep their RRULE.
            </p>
            <input
              type="file"
              accept=".ics,text/calendar"
              onChange={onFile}
              className="block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-sm file:text-slate-200"
            />
            {parseError && <p className="text-sm text-rose-400">{parseError}</p>}
            {events.length > 0 && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-300">List name</span>
                  <input
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-300">
                  <div className="mb-1 text-slate-400">
                    {events.length} event{events.length === 1 ? '' : 's'} found
                    {errors.length > 0 ? ` (${errors.length} skipped)` : ''}
                  </div>
                  <ul className="max-h-40 list-disc space-y-0.5 overflow-auto pl-4">
                    {events.slice(0, 8).map((ev) => (
                      <li key={ev.uid} className="truncate">
                        {ev.title}
                        {ev.is_recurring ? ' ↻' : ''}
                      </li>
                    ))}
                    {events.length > 8 && <li className="text-slate-500">…and {events.length - 8} more</li>}
                  </ul>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={onImport}
                disabled={events.length === 0 || importIcs.isPending}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {importIcs.isPending ? 'Importing…' : `Import ${events.length}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-200">
              Imported {done.inserted} task{done.inserted === 1 ? '' : 's'}
              {done.skipped > 0 ? ` (skipped ${done.skipped} duplicate${done.skipped === 1 ? '' : 's'})` : ''}.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
