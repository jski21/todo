-- Initial schema for the recurring todo app.
-- Every table is scoped to auth.uid() via RLS.

create extension if not exists "pgcrypto";

-- profiles ------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  timezone    text not null default 'America/New_York',
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (id = auth.uid());
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- lists ---------------------------------------------------------------
create table if not exists lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  color       text,
  icon        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists lists_user_idx on lists(user_id);

alter table lists enable row level security;
create policy "lists_select_own" on lists for select using (user_id = auth.uid());
create policy "lists_insert_own" on lists for insert with check (user_id = auth.uid());
create policy "lists_update_own" on lists for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "lists_delete_own" on lists for delete using (user_id = auth.uid());

-- tasks ---------------------------------------------------------------
create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_id          uuid references lists(id) on delete set null,
  title            text not null,
  notes            text,
  is_recurring     boolean not null default false,
  rrule            text,
  dtstart          timestamptz not null,
  due_time         time,
  duration_minutes int,
  priority         int,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tasks_user_idx on tasks(user_id);
create index if not exists tasks_user_active_idx on tasks(user_id, active);

alter table tasks enable row level security;
create policy "tasks_select_own" on tasks for select using (user_id = auth.uid());
create policy "tasks_insert_own" on tasks for insert with check (user_id = auth.uid());
create policy "tasks_update_own" on tasks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_delete_own" on tasks for delete using (user_id = auth.uid());

-- task_occurrences ----------------------------------------------------
create table if not exists task_occurrences (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id          uuid not null references tasks(id) on delete cascade,
  occurrence_date  date not null,
  scheduled_at     timestamptz,
  status           text not null default 'pending' check (status in ('pending','done','skipped')),
  completed_at     timestamptz,
  is_exception     boolean not null default false,
  override_title   text,
  override_notes   text,
  override_time    time,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (task_id, occurrence_date)
);
create index if not exists task_occurrences_user_date_idx on task_occurrences(user_id, occurrence_date);
create index if not exists task_occurrences_task_idx on task_occurrences(task_id);

alter table task_occurrences enable row level security;
create policy "occ_select_own" on task_occurrences for select using (user_id = auth.uid());
create policy "occ_insert_own" on task_occurrences for insert with check (user_id = auth.uid());
create policy "occ_update_own" on task_occurrences for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "occ_delete_own" on task_occurrences for delete using (user_id = auth.uid());

-- updated_at triggers -------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before update on tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists occ_touch on task_occurrences;
create trigger occ_touch before update on task_occurrences
  for each row execute function public.touch_updated_at();

-- forward-compat tables (no UI in this phase) -------------------------
create table if not exists tickets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token         text unique not null,
  task_id       uuid references tasks(id) on delete set null,
  occurrence_id uuid references task_occurrences(id) on delete set null,
  kind          text,
  printed_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
alter table tickets enable row level security;
create policy "tickets_select_own" on tickets for select using (user_id = auth.uid());
create policy "tickets_insert_own" on tickets for insert with check (user_id = auth.uid());
create policy "tickets_update_own" on tickets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tickets_delete_own" on tickets for delete using (user_id = auth.uid());

create table if not exists print_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null,
  status      text not null default 'queued' check (status in ('queued','printing','done','error')),
  created_at  timestamptz not null default now(),
  printed_at  timestamptz
);
alter table print_jobs enable row level security;
create policy "pj_select_own" on print_jobs for select using (user_id = auth.uid());
create policy "pj_insert_own" on print_jobs for insert with check (user_id = auth.uid());
create policy "pj_update_own" on print_jobs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pj_delete_own" on print_jobs for delete using (user_id = auth.uid());
