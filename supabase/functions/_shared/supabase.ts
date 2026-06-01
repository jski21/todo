// Build a Supabase client that uses the caller's JWT, so RLS scopes every query
// to the device user automatically.
// @ts-expect-error Deno-only import
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export function clientForRequest(req: Request): SupabaseClient | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  // @ts-expect-error Deno global
  const url = Deno.env.get('SUPABASE_URL');
  // @ts-expect-error Deno global
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
