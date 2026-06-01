import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

/** Subscribe to live changes on tasks + task_occurrences and refresh caches. */
export function useRealtime(): void {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-${user.id}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['tasks'] });
          qc.invalidateQueries({ queryKey: ['occurrences'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_occurrences', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['occurrences'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ['lists'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);
}
