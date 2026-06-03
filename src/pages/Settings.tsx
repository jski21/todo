import { useState } from 'react';
import { DateTime } from 'luxon';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useShoppingLists } from '@/hooks/useShopping';
import { useRecentPrintJobs } from '@/hooks/usePrint';

const COMMON_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: shoppingLists = [] } = useShoppingLists();
  const { data: recentJobs = [] } = useRecentPrintJobs(10);

  const [tz, setTz] = useState<string>('');
  const tzValue = tz || profile?.timezone || '';

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-2 rounded-md border border-slate-800 bg-slate-900/50 p-4">
        <div className="text-sm text-slate-400">Signed in as</div>
        <div className="text-sm">{user?.email}</div>
        <button
          onClick={signOut}
          className="mt-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
        >
          Sign out
        </button>
      </section>

      <section className="space-y-2 rounded-md border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Timezone</h2>
        <select
          value={tzValue}
          onChange={(e) => setTz(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          {[tzValue, ...COMMON_ZONES.filter((z) => z !== tzValue)]
            .filter(Boolean)
            .map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
        </select>
        <button
          disabled={!tz || tz === profile?.timezone}
          onClick={() => updateProfile.mutate({ timezone: tz })}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          Save
        </button>
      </section>

      <PrintingSection
        profile={profile}
        shoppingLists={shoppingLists}
        onSave={(patch) => updateProfile.mutate(patch)}
        saving={updateProfile.isPending}
      />

      <RecentPrintsSection jobs={recentJobs} />
    </div>
  );
}

// ---- Printing section ------------------------------------------------

type ProfileLike = ReturnType<typeof useProfile>['data'];

function PrintingSection({
  profile,
  shoppingLists,
  onSave,
  saving,
}: {
  profile: ProfileLike;
  shoppingLists: { id: string; name: string }[];
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [width, setWidth] = useState<number | ''>('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [time, setTime] = useState<string>('');
  const [defaultListId, setDefaultListId] = useState<string | null | undefined>(undefined);

  const widthValue = width === '' ? (profile?.printer_width_chars ?? 32) : width;
  const enabledValue = enabled ?? (profile?.daily_print_enabled ?? false);
  const timeValue = time || (profile?.daily_print_time ?? '');
  const listValue =
    defaultListId === undefined ? (profile?.default_shopping_list_id ?? '') : (defaultListId ?? '');

  const dirty =
    width !== '' ||
    enabled !== null ||
    time !== '' ||
    defaultListId !== undefined;

  function save() {
    const patch: Record<string, unknown> = {};
    if (width !== '') patch.printer_width_chars = Number(widthValue);
    if (enabled !== null) patch.daily_print_enabled = enabledValue;
    if (time !== '') patch.daily_print_time = timeValue || null;
    if (defaultListId !== undefined) patch.default_shopping_list_id = listValue || null;
    onSave(patch);
    setWidth('');
    setEnabled(null);
    setTime('');
    setDefaultListId(undefined);
  }

  return (
    <section className="space-y-3 rounded-md border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Printing</h2>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">Paper width</span>
        <select
          value={widthValue}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          <option value={32}>58mm (32 chars)</option>
          <option value={48}>80mm (48 chars)</option>
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-300">Default shopping list</span>
        <select
          value={listValue}
          onChange={(e) => setDefaultListId(e.target.value || null)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          <option value="">— None —</option>
          {shoppingLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Where barcode scans drop items when no list is specified.
        </p>
      </label>

      <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabledValue}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-slate-200">Print today’s agenda automatically</span>
        </label>
        <label className="mt-2 block text-sm">
          <span className="mb-1 block text-slate-400">At</span>
          <input
            type="time"
            value={timeValue || ''}
            onChange={(e) => setTime(e.target.value)}
            disabled={!enabledValue}
            className="w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Schedule lives in Supabase (set up <code>pg_cron</code> to hit
          <code>enqueue-print {'{'} "type": "daily" {'}'}</code> at this time using the device JWT).
        </p>
      </div>

      <button
        disabled={!dirty || saving}
        onClick={save}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save printing settings'}
      </button>
    </section>
  );
}

// ---- Recent print jobs ----------------------------------------------

function RecentPrintsSection({
  jobs,
}: {
  jobs: {
    id: string;
    type: string;
    status: string;
    error: string | null;
    attempts: number;
    printed_at: string | null;
    created_at: string;
  }[];
}) {
  return (
    <section className="space-y-2 rounded-md border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Recent print jobs
      </h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No print jobs yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {jobs.map((j) => {
            const when = j.printed_at
              ? DateTime.fromISO(j.printed_at).toRelative()
              : DateTime.fromISO(j.created_at).toRelative();
            const tone =
              j.status === 'done'
                ? 'text-emerald-300'
                : j.status === 'error'
                  ? 'text-rose-400'
                  : 'text-slate-300';
            return (
              <li
                key={j.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/40 px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium uppercase ${tone}`}>{j.status}</span>
                  <span className="text-slate-200">{j.type}</span>
                  {j.attempts > 0 && (
                    <span className="text-xs text-slate-500">{j.attempts} attempts</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {j.error && (
                    <span className="max-w-xs truncate text-xs text-rose-400" title={j.error}>
                      {j.error}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">{when}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
