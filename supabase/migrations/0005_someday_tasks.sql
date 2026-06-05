-- 'Someday' tasks — tasks without a scheduled date that live in a list but
-- never materialize into task_occurrences (so they stay off the dashboard
-- and the calendar). Setting is_someday=false on an existing task makes it
-- behave like a normal scheduled task again.

alter table tasks
  add column if not exists is_someday boolean not null default false;

-- Index helps the lists page's "someday tasks in this list" query and the
-- occurrence-generator's "skip these" filter both stay snappy.
create index if not exists tasks_someday_idx
  on tasks (user_id, is_someday, list_id)
  where is_someday = true;
