-- v2 backend: activate tickets + print_jobs and add device/printer settings.
-- Additive only — no changes to existing column types or rows.

-- print_jobs: turn the stub into a real work queue ----------------------
alter table print_jobs add column if not exists error      text;
alter table print_jobs add column if not exists attempts   int  not null default 0;
alter table print_jobs add column if not exists claimed_at timestamptz;
create index if not exists print_jobs_status_idx on print_jobs (status, created_at);

-- profiles: device + printer + daily-print settings --------------------
alter table profiles add column if not exists printer_width_chars      int  not null default 32; -- 32 for 58mm, 48 for 80mm
alter table profiles add column if not exists daily_print_enabled      boolean not null default false;
alter table profiles add column if not exists daily_print_time         time;
alter table profiles add column if not exists default_shopping_list_id uuid references shopping_lists(id) on delete set null;

-- shopping_list_items: track how an item got onto the list ------------
-- 'manual' (default for legacy rows is null), 'scan', etc.
alter table shopping_list_items add column if not exists added_via text;

-- realtime publication: ensure print_jobs is published ----------------
-- (tasks, task_occurrences, lists, shopping_lists, shopping_list_items
-- are assumed already published from v1/v1.1.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'print_jobs'
  ) then
    execute 'alter publication supabase_realtime add table print_jobs';
  end if;
exception when undefined_object then
  -- supabase_realtime publication doesn't exist (e.g. local dev without realtime); ignore.
  null;
end$$;

-- helper: short, url-safe ticket tokens used by enqueue-print ----------
-- 12 base32-ish chars, ~60 bits. Crypto-strong via gen_random_bytes.
create or replace function public.gen_ticket_token()
returns text
language sql
as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/=', 'abc');
$$;
