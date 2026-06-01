import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useTimezone } from './useProfile';
import { combineDateTimeUtc } from '@/lib/dates';
import { generateOccurrences, rruleWithUntil } from '@/lib/recurrence';
import type { Task, TaskOccurrence, OccurrenceWithTask, TaskStatus } from '@/types/db';

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  list_id?: string | null;
  date: string; // YYYY-MM-DD (local anchor)
  time?: string | null; // HH:mm
  priority?: number | null;
  is_recurring: boolean;
  rrule?: string | null;
}

export function useTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tasks', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    enabled: !!id,
    queryFn: async (): Promise<Task | null> => {
      if (!id) return null;
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Task | null;
    },
  });
}

/**
 * Fetch occurrences with their parent task across a date range (inclusive).
 */
export function useOccurrences(rangeStart: string, rangeEnd: string) {
  const { user } = useAuth();
  const zone = useTimezone();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['occurrences', user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    queryFn: async (): Promise<OccurrenceWithTask[]> => {
      if (!user) return [];
      // Ensure occurrences exist for this window before reading.
      const startDt = DateTime.fromISO(rangeStart, { zone }).startOf('day').toJSDate();
      const endDt = DateTime.fromISO(rangeEnd, { zone }).endOf('day').toJSDate();
      await generateOccurrences(user.id, zone, startDt, endDt);
      const { data, error } = await supabase
        .from('task_occurrences')
        .select('*, task:tasks(*)')
        .gte('occurrence_date', rangeStart)
        .lte('occurrence_date', rangeEnd)
        .order('occurrence_date', { ascending: true });
      if (error) throw error;
      // Invalidate task list cache passively so list view stays fresh.
      qc.setQueryData(['occurrences:last'], { rangeStart, rangeEnd });
      return (data ?? []) as OccurrenceWithTask[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const zone = useTimezone();
  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<Task> => {
      if (!user) throw new Error('not signed in');
      const dtstart = combineDateTimeUtc(input.date, input.time ?? '00:00', zone);
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: input.title,
          notes: input.notes ?? null,
          list_id: input.list_id ?? null,
          dtstart,
          due_time: input.time ?? null,
          priority: input.priority ?? null,
          is_recurring: input.is_recurring,
          rrule: input.is_recurring ? input.rrule ?? null : null,
        })
        .select()
        .single();
      if (error) throw error;
      const task = data as Task;

      // Materialize at least the rolling 60-day window plus the visible range if recurring,
      // otherwise just the single occurrence row.
      if (!task.is_recurring) {
        await supabase.from('task_occurrences').upsert(
          {
            task_id: task.id,
            occurrence_date: input.date,
            scheduled_at: dtstart,
          },
          { onConflict: 'task_id,occurrence_date', ignoreDuplicates: true },
        );
      } else {
        const start = DateTime.now().setZone(zone).minus({ days: 7 }).startOf('day').toJSDate();
        const end = DateTime.now().setZone(zone).plus({ days: 90 }).endOf('day').toJSDate();
        await generateOccurrences(user.id, zone, start, end);
      }
      return task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useSetOccurrenceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: TaskStatus }) => {
      const completed_at = args.status === 'done' ? new Date().toISOString() : null;
      const { error } = await supabase
        .from('task_occurrences')
        .update({ status: args.status, completed_at })
        .eq('id', args.id);
      if (error) throw error;
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ['occurrences'] });
      const snapshots = qc.getQueriesData<OccurrenceWithTask[]>({ queryKey: ['occurrences'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<OccurrenceWithTask[]>(
          key,
          data.map((o) =>
            o.id === args.id
              ? {
                  ...o,
                  status: args.status,
                  completed_at: args.status === 'done' ? new Date().toISOString() : null,
                }
              : o,
          ),
        );
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
  });
}

/** Apply an override to a single occurrence (this-occurrence-only edit). */
export function useOverrideOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      override_title?: string | null;
      override_notes?: string | null;
      override_time?: string | null;
    }) => {
      const { id, ...rest } = args;
      const { error } = await supabase
        .from('task_occurrences')
        .update({ ...rest, is_exception: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
  });
}

/** Skip a single occurrence (delete this-occurrence-only on a recurring task). */
export function useSkipOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('task_occurrences')
        .update({ status: 'skipped', is_exception: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
  });
}

export interface EditAllInput {
  task_id: string;
  title?: string;
  notes?: string | null;
  list_id?: string | null;
  time?: string | null;
  rrule?: string | null;
  dtstart?: string | null; // local YYYY-MM-DD
}

/** Edit the whole series ("all"). Future not-yet-completed occurrences regenerate. */
export function useEditAll() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const zone = useTimezone();
  return useMutation({
    mutationFn: async (input: EditAllInput) => {
      if (!user) throw new Error('not signed in');
      const patch: Partial<Task> = {};
      if (input.title != null) patch.title = input.title;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.list_id !== undefined) patch.list_id = input.list_id;
      if (input.time !== undefined) patch.due_time = input.time;
      if (input.rrule !== undefined) patch.rrule = input.rrule;
      if (input.dtstart) patch.dtstart = combineDateTimeUtc(input.dtstart, input.time ?? '00:00', zone);
      const { error } = await supabase.from('tasks').update(patch).eq('id', input.task_id);
      if (error) throw error;

      // Delete future non-completed occurrences so they regenerate from the new rule.
      const todayKey = DateTime.now().setZone(zone).toISODate();
      if (todayKey) {
        await supabase
          .from('task_occurrences')
          .delete()
          .eq('task_id', input.task_id)
          .gte('occurrence_date', todayKey)
          .neq('status', 'done')
          .eq('is_exception', false);
      }
      const start = DateTime.now().setZone(zone).startOf('day').toJSDate();
      const end = DateTime.now().setZone(zone).plus({ days: 90 }).endOf('day').toJSDate();
      await generateOccurrences(user.id, zone, start, end);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export interface EditFutureInput extends EditAllInput {
  boundary_date: string; // YYYY-MM-DD local
}

/**
 * Split the series at `boundary_date`. Original task gets an UNTIL clause; a new task
 * is created starting at boundary with the edited fields.
 */
export function useEditThisAndFuture() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const zone = useTimezone();
  return useMutation({
    mutationFn: async (input: EditFutureInput) => {
      if (!user) throw new Error('not signed in');
      const { data: orig, error: gErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', input.task_id)
        .single();
      if (gErr) throw gErr;
      const original = orig as Task;

      // 1. Cap the original series the day before the boundary.
      if (original.rrule) {
        const cappedRule = rruleWithUntil(original.rrule, input.boundary_date, zone);
        const { error: upErr } = await supabase
          .from('tasks')
          .update({ rrule: cappedRule })
          .eq('id', original.id);
        if (upErr) throw upErr;
      }

      // 2. Drop occurrences at-or-after boundary for the original task (regenerate enforces UNTIL).
      await supabase
        .from('task_occurrences')
        .delete()
        .eq('task_id', original.id)
        .gte('occurrence_date', input.boundary_date)
        .eq('is_exception', false);

      // 3. Create a new task with the edited fields anchored at the boundary.
      const newDtstart = combineDateTimeUtc(
        input.boundary_date,
        input.time ?? original.due_time ?? '00:00',
        zone,
      );
      const { data: newRow, error: insErr } = await supabase
        .from('tasks')
        .insert({
          list_id: input.list_id !== undefined ? input.list_id : original.list_id,
          title: input.title ?? original.title,
          notes: input.notes !== undefined ? input.notes : original.notes,
          is_recurring: true,
          rrule: input.rrule !== undefined ? input.rrule : original.rrule,
          dtstart: newDtstart,
          due_time: input.time !== undefined ? input.time : original.due_time,
          duration_minutes: original.duration_minutes,
          priority: original.priority,
          active: true,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      const start = DateTime.fromISO(input.boundary_date, { zone }).startOf('day').toJSDate();
      const end = DateTime.now().setZone(zone).plus({ days: 90 }).endOf('day').toJSDate();
      await generateOccurrences(user.id, zone, start, end);
      return newRow as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useDeleteTaskAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task_id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', task_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

/** "This and future" delete: cap the original rule and drop future occurrences. */
export function useDeleteThisAndFuture() {
  const qc = useQueryClient();
  const zone = useTimezone();
  return useMutation({
    mutationFn: async (args: { task_id: string; boundary_date: string }) => {
      const { data: orig, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', args.task_id)
        .single();
      if (error) throw error;
      const task = orig as Task;
      if (task.rrule) {
        const capped = rruleWithUntil(task.rrule, args.boundary_date, zone);
        await supabase.from('tasks').update({ rrule: capped }).eq('id', task.id);
      } else {
        // One-off: just delete.
        await supabase.from('tasks').delete().eq('id', task.id);
        return;
      }
      await supabase
        .from('task_occurrences')
        .delete()
        .eq('task_id', task.id)
        .gte('occurrence_date', args.boundary_date);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useOccurrence(id: string | undefined) {
  return useQuery({
    queryKey: ['occurrence', id],
    enabled: !!id,
    queryFn: async (): Promise<OccurrenceWithTask | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('task_occurrences')
        .select('*, task:tasks(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OccurrenceWithTask | null;
    },
  });
}

export type { TaskOccurrence };
