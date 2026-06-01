import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { List } from '@/types/db';

export function useLists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lists', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<List[]> => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as List[];
    },
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name: string; color?: string | null }) => {
      const { data, error } = await supabase
        .from('lists')
        .insert({ name: patch.name, color: patch.color ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as List;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  });
}

export function useUpdateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string } & Partial<Pick<List, 'name' | 'color' | 'sort_order'>>) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from('lists').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lists'] }),
  });
}
