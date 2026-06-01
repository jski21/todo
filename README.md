# Todo

Personal recurring task manager — dashboard, calendar, recurring tasks, PWA. Frontend on Vite + React + TS, backend on Supabase (Postgres + Auth + Realtime). This phase is the web app only; thermal printer + Raspberry Pi kiosk come later.

## Setup

```bash
npm install
cp .env.example .env   # fill in NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Apply `supabase/migrations/*.sql` to your Supabase project (Studio SQL editor or `supabase db push`). RLS is enabled on every table — queries are scoped to `auth.uid()`.

## Architecture

- `src/lib/recurrence.ts` — RRULE building/parsing and occurrence materialization
- `src/lib/dates.ts` — Luxon + timezone helpers
- `src/lib/supabase.ts` — typed client
- `src/hooks/` — TanStack Query hooks (`useTasks`, `useOccurrences`, `useLists`, `useRealtime`, `useAuth`, `useProfile`)
- `src/pages/` — Login, Dashboard (Today), Calendar, Lists, Shopping, Settings
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

### Shopping lists (v1.1)

Additive feature (`supabase/migrations/0003_shopping.sql`): `products` (personal catalog that learns from manual adds for autocomplete / quick re-add), `shopping_lists`, and `shopping_list_items`. Same RLS pattern as everything else. Adding an item upserts the catalog product by `(user_id, lower(name))`, denormalizes the name onto the item, and bumps the quantity if an unchecked item with that name is already on the list rather than duplicating. Free-text items (null `product_id`) are allowed. Post-trip "clear checked" / "clear all" actions; Realtime-synced like tasks. The catalog's `barcode`/`image_url`/`default_aisle` columns are nullable and unused until the v2 hardware phase (scanning / aisle sorting).

## Out of scope for v1

Thermal printer logic, Pi kiosk display, barcodes, push notifications, Google Calendar sync, AI, multi-user. The `tickets` and `print_jobs` tables exist for forward-compat but have no UI.
