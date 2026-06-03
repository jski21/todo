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

### v2 backend (hardware loop)

`supabase/migrations/0004_v2_hardware.sql` makes the existing `tickets` + `print_jobs` tables functional, adds a `gen_ticket_token()` helper, gives `profiles` printer/daily-print settings (`printer_width_chars`, `daily_print_enabled`, `daily_print_time`, `default_shopping_list_id`), and adds `added_via` to `shopping_list_items`. `print_jobs` joins the `supabase_realtime` publication so a queued job pushes to the Pi printer client live.

Two edge functions live under `supabase/functions/`:

- **`resolve-scan`** — POST `{ code, list_id? }`. Routes the scan:
  1. If `code` looks like a ticket URL (`.../t/<token>`) or bare token and matches a `tickets` row, mark its linked `task_occurrences` row `done` (idempotent on repeat).
  2. If `code` validates as a UPC-A / EAN-13 / EAN-8 (mod-10 check digit in `_shared/barcode.ts`), resolve the destination list (`list_id` else `profiles.default_shopping_list_id`), look the product up in the catalog, and on a miss query Open Food Facts; on a hit cache + add (or increment) a `shopping_list_items` row with `added_via='scan'`.
  3. Otherwise → `unknown`.
- **`enqueue-print`** — POST `{ type, … }`. Builds the agreed payload (`src/types/print.ts` / `_shared/types.ts`) and inserts a `print_jobs` row. For `type: "occurrence"` it also mints a `tickets` row and embeds the QR URL `${APP_URL}/t/<token>` so scanning the printout completes the task.

Deploy with:

```bash
supabase functions deploy resolve-scan
supabase functions deploy enqueue-print
supabase secrets set APP_URL=https://your-app.vercel.app
```

Both functions use the **caller's JWT** — no service-role path on the Pi. RLS scopes everything to `auth.uid()`.

### Device identity (Pi auth)

One account, long-lived refresh token. Sign in to the web app once on a paired laptop, copy the `refresh_token` from `localStorage["sb-<project-ref>-auth-token"]`, drop it into the Pi's config. On boot the Pi calls `supabase.auth.setSession({ refresh_token })` and then refreshes periodically. Each refresh rotates the token; persist the new one. The Pi never sees the Supabase JWT secret or service-role key, and you can revoke it at any time from Supabase Studio → Authentication → Users.

### Daily print (optional)

Off by default. When you flip `profiles.daily_print_enabled = true` and set `daily_print_time`, set up a `pg_cron` job (Supabase Studio → Database → Extensions → enable `pg_cron` + `pg_net`) that hits `enqueue-print { "type": "daily" }` near that time using the device user's JWT as the `Authorization` header. The function is timezone-aware via `profiles.timezone`.

## Out of scope for v1

Thermal printer logic, Pi kiosk display, push notifications, Google Calendar sync, AI, multi-user. The v2 backend (above) makes the printer/scanner integration possible; the Pi clients themselves are a separate prompt.
