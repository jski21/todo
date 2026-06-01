import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { Product, ShoppingList, ShoppingListItem } from '@/types/db';

// PostgREST ilike treats % and _ as wildcards; escape so a name match is exact
// (case-insensitive). Backslash escapes them in ilike patterns.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// ---- lists -----------------------------------------------------------

export function useShoppingLists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['shopping_lists', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ShoppingList[]> => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShoppingList[];
    },
  });
}

export function useCreateShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<ShoppingList> => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      return data as ShoppingList;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_lists'] }),
  });
}

export function useUpdateShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { id: string } & Partial<Pick<ShoppingList, 'name' | 'sort_order'>>) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from('shopping_lists').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_lists'] }),
  });
}

export function useDeleteShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shopping_lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping_lists'] });
      qc.invalidateQueries({ queryKey: ['shopping_items'] });
    },
  });
}

// ---- items -----------------------------------------------------------

export function useShoppingItems(listId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['shopping_items', user?.id, listId],
    enabled: !!user && !!listId,
    queryFn: async (): Promise<ShoppingListItem[]> => {
      if (!listId) return [];
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', listId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShoppingListItem[];
    },
  });
}

export interface AddItemInput {
  list_id: string;
  name: string;
  quantity?: number;
  unit?: string | null;
  product_id?: string | null;
}

/**
 * Add an item. Upserts a products catalog row by (user_id, lower(name)) so staples
 * are remembered, then either bumps an existing unchecked item's quantity or inserts
 * a new item with the name denormalized.
 */
export function useAddShoppingItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: AddItemInput): Promise<ShoppingListItem> => {
      if (!user) throw new Error('not signed in');
      const name = input.name.trim();
      if (!name) throw new Error('name required');
      const quantity = input.quantity ?? 1;

      // 1. Resolve / create the catalog product (unless caller already picked one).
      let productId: string | null = input.product_id ?? null;
      if (!productId) {
        const { data: existing, error: selErr } = await supabase
          .from('products')
          .select('id')
          .ilike('name', escapeLike(name))
          .maybeSingle();
        if (selErr) throw selErr;
        if (existing) {
          productId = (existing as { id: string }).id;
        } else {
          const { data: created, error: insErr } = await supabase
            .from('products')
            .insert({ name })
            .select('id')
            .single();
          // 23505 = someone raced us; re-select.
          if (insErr && insErr.code === '23505') {
            const { data: re } = await supabase
              .from('products')
              .select('id')
              .ilike('name', escapeLike(name))
              .maybeSingle();
            productId = (re as { id: string } | null)?.id ?? null;
          } else if (insErr) {
            throw insErr;
          } else {
            productId = (created as { id: string }).id;
          }
        }
      }

      // 2. If an unchecked item with the same name is already on the list, bump qty.
      const { data: dupes, error: dupeErr } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', input.list_id)
        .eq('checked', false)
        .ilike('name', escapeLike(name));
      if (dupeErr) throw dupeErr;
      const dupe = (dupes ?? [])[0] as ShoppingListItem | undefined;
      if (dupe) {
        const { data: updated, error: updErr } = await supabase
          .from('shopping_list_items')
          .update({ quantity: Number(dupe.quantity) + quantity })
          .eq('id', dupe.id)
          .select()
          .single();
        if (updErr) throw updErr;
        return updated as ShoppingListItem;
      }

      // 3. Insert a new item.
      const { data: item, error: itemErr } = await supabase
        .from('shopping_list_items')
        .insert({
          list_id: input.list_id,
          product_id: productId,
          name,
          quantity,
          unit: input.unit ?? null,
        })
        .select()
        .single();
      if (itemErr) throw itemErr;
      return item as ShoppingListItem;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['shopping_items'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      void vars;
    },
  });
}

export function useUpdateShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      patch: { id: string; list_id: string } & Partial<
        Pick<ShoppingListItem, 'name' | 'quantity' | 'unit' | 'sort_order'>
      >,
    ) => {
      const { id, list_id: _list, ...rest } = patch;
      void _list;
      const { error } = await supabase.from('shopping_list_items').update(rest).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_items'] }),
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; list_id: string; checked: boolean }) => {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ checked: args.checked })
        .eq('id', args.id);
      if (error) throw error;
    },
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: ['shopping_items'] });
      const snapshots = qc.getQueriesData<ShoppingListItem[]>({ queryKey: ['shopping_items'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<ShoppingListItem[]>(
          key,
          data.map((it) => (it.id === args.id ? { ...it, checked: args.checked } : it)),
        );
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['shopping_items'] }),
  });
}

export function useDeleteShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; list_id: string }) => {
      const { error } = await supabase.from('shopping_list_items').delete().eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_items'] }),
  });
}

/** Post-trip: remove checked items, or empty the whole list. */
export function useClearShoppingItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { list_id: string; scope: 'checked' | 'all' }) => {
      let q = supabase.from('shopping_list_items').delete().eq('list_id', args.list_id);
      if (args.scope === 'checked') q = q.eq('checked', true);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_items'] }),
  });
}

// ---- catalog autocomplete -------------------------------------------

export function useProductSearch(prefix: string) {
  const { user } = useAuth();
  const q = prefix.trim();
  return useQuery({
    queryKey: ['products', user?.id, q.toLowerCase()],
    enabled: !!user && q.length >= 1,
    staleTime: 60_000,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('name', `${escapeLike(q)}%`)
        .order('name', { ascending: true })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}
