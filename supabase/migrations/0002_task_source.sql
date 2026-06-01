-- Track imported calendar events so re-imports don't duplicate.
alter table tasks add column if not exists source text;
alter table tasks add column if not exists source_uid text;
create unique index if not exists tasks_user_source_uid_idx
  on tasks (user_id, source, source_uid)
  where source_uid is not null;
