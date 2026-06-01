import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useTimezone } from './useProfile';
import { generateOccurrences } from '@/lib/recurrence';
import type { ImportedEvent } from '@/lib/ics';
import type { List } from '@/types/db';

interface ImportInput {
  listName: string;
  listColor?: string | null;
  source: string; // e.g. "outlook" | "gmail" | "ics"
  events: ImportedEvent[];
}

export interface ImportResult {
  list: List;
  inserted: number;
  skipped: number;
}

export function useImportIcs() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const zone = useTimezone();

  return useMutation({
    mutationFn: async (input: ImportInput): Promise<ImportResult> => {
      if (!user) throw new Error('not signed in');

      const { data: list, error: listErr } = await supabase
        .from('lists')
        .insert({ name: input.listName, color: input.listColor ?? '#10b981' })
        .select()
        .single();
      if (listErr) throw listErr;

      const rows = input.events.map((e) => ({
        list_id: list.id,
        title: e.title,
        notes: e.notes,
        is_recurring: e.is_recurring,
        rrule: e.rrule,
        dtstart: e.dtstart,
        due_time: e.due_time,
        source: input.source,
        source_uid: e.uid,
        active: true,
      }));

      let inserted = 0;
      let skipped = 0;
      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        // Upsert on (user_id, source, source_uid) ignores duplicates.
        const { data, error } = await supabase
          .from('tasks')
          .upsert(slice, { onConflict: 'user_id,source,source_uid', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        inserted += data?.length ?? 0;
        skipped += slice.length - (data?.length ?? 0);
      }

      // Materialize occurrences for the rolling window.
      const start = DateTime.now().setZone(zone).minus({ days: 14 }).startOf('day').toJSDate();
      const end = DateTime.now().setZone(zone).plus({ days: 90 }).endOf('day').toJSDate();
      await generateOccurrences(user.id, zone, start, end);

      return { list: list as List, inserted, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}
