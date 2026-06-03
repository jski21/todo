import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export type PrintJobType =
  | { type: 'shopping_list'; list_id: string }
  | { type: 'daily' }
  | { type: 'occurrence'; occurrence_id: string };

interface EnqueuePrintResult {
  job_id: string;
}

interface RecentPrintJob {
  id: string;
  type: string;
  status: 'queued' | 'printing' | 'done' | 'error';
  error: string | null;
  attempts: number;
  printed_at: string | null;
  created_at: string;
}

export function useEnqueuePrint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PrintJobType): Promise<EnqueuePrintResult> => {
      const { data, error } = await supabase.functions.invoke('enqueue-print', {
        body: input,
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || !('job_id' in data)) {
        throw new Error('enqueue-print: unexpected response shape');
      }
      return data as EnqueuePrintResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print_jobs'] });
    },
  });
}

export function useRecentPrintJobs(limit = 10) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['print_jobs', user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<RecentPrintJob[]> => {
      const { data, error } = await supabase
        .from('print_jobs')
        .select('id, type, status, error, attempts, printed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as RecentPrintJob[];
    },
  });
}
