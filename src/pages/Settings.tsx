import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';

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
  const [tz, setTz] = useState<string>('');

  const current = tz || profile?.timezone || '';

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 md:p-6">
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
          value={current}
          onChange={(e) => setTz(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
        >
          {[current, ...COMMON_ZONES.filter((z) => z !== current)]
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
    </div>
  );
}
