export type TaskStatus = 'pending' | 'done' | 'skipped';

export interface Profile {
  id: string;
  timezone: string;
  created_at: string;
}

export interface List {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  list_id: string | null;
  title: string;
  notes: string | null;
  is_recurring: boolean;
  rrule: string | null;
  dtstart: string;
  due_time: string | null;
  duration_minutes: number | null;
  priority: number | null;
  active: boolean;
  source: string | null;
  source_uid: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskOccurrence {
  id: string;
  user_id: string;
  task_id: string;
  occurrence_date: string;
  scheduled_at: string | null;
  status: TaskStatus;
  completed_at: string | null;
  is_exception: boolean;
  override_title: string | null;
  override_notes: string | null;
  override_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface OccurrenceWithTask extends TaskOccurrence {
  task: Task;
}
