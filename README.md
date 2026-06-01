# Todo

Personal recurring task manager — dashboard, calendar, recurring tasks, PWA. Frontend on Vite + React + TS, backend on Supabase (Postgres + Auth + Realtime). This phase is the web app only; thermal printer + Raspberry Pi kiosk come later.

## Setup

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Apply `supabase/migrations/*.sql` to your Supabase project (Studio SQL editor or `supabase db push`). RLS is enabled on every table — queries are scoped to `auth.uid()`.

## Architecture

- `src/lib/recurrence.ts` — RRULE building/parsing and occurrence materialization
- `src/lib/dates.ts` — Luxon + timezone helpers
- `src/lib/supabase.ts` — typed client
- `src/hooks/` — TanStack Query hooks (`useTasks`, `useOccurrences`, `useLists`, `useRealtime`, `useAuth`, `useProfile`)
- `src/pages/` — Login, Dashboard (Today), Calendar, Lists, Settings
- `src/components/calendar/` — custom month grid + week view
- `src/components/tasks/` — form, quick add, list item, occurrence detail, edit-scope dialog
- `src/components/recurrence/` — recurrence builder with live `toText()` preview

### Recurrence model

A recurring task is a single `tasks` row with an RRULE; concrete instances live in `task_occurrences`. One-offs use the same shape (`is_recurring=false`, one occurrence row). The calendar reads occurrences directly — never expands rules at render time. The `unique(task_id, occurrence_date)` constraint makes generation idempotent.

Editing a recurring task asks for scope:
- **This occurrence**: per-occurrence override (`is_exception=true`, `override_*`); delete = `status='skipped'`.
- **This and following**: split — cap original rule with `UNTIL = boundary - 1d`, create new task starting at boundary.
- **All**: update template, delete future not-yet-completed occurrences, regenerate.

Times are anchored in `profiles.timezone` so "7am every day" stays 7am local across DST.

## Out of scope for v1

Thermal printer logic, Pi kiosk display, barcodes, push notifications, Google Calendar sync, AI, multi-user. The `tickets` and `print_jobs` tables exist for forward-compat but have no UI.
