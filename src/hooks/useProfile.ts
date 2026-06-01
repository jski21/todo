import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { browserZone } from '@/lib/dates';
import { useAuth } from './useAuth';
import type { Profile } from '@/types/db';

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as Profile;
      // Bootstrap profile if missing (trigger should have made it, but be safe).
      const tz = browserZone();
      const { data: created, error: insErr } = await supabase
        .from('profiles')
        .insert({ id: user.id, timezone: tz })
        .select()
        .single();
      if (insErr) throw insErr;
      return created as Profile;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

export function useTimezone(): string {
  const { data } = useProfile();
  return data?.timezone ?? browserZone();
}
