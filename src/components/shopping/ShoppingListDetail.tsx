import { useMemo } from 'react';
import { useClearShoppingItems, useShoppingItems } from '@/hooks/useShopping';
import { AddItem } from './AddItem';
import { ShoppingItem } from './ShoppingItem';
import { PrintButton } from '@/components/print/PrintButton';
import type { ShoppingList } from '@/types/db';

export function ShoppingListDetail({ list }: { list: ShoppingList }) {
  const { data: items = [], isLoading, isError } = useShoppingItems(list.id);
  const clear = useClearShoppingItems();

  const { unchecked, checked } = useMemo(() => {
    return {
      unchecked: items.filter((i) => !i.checked),
      checked: items.filter((i) => i.checked),
    };
  }, [items]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-3">
        <h1 className="text-lg font-semibold">{list.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton
            request={{ type: 'shopping_list', list_id: list.id }}
            label="Print list"
            disabled={unchecked.length === 0}
          />
          <button
            onClick={() => clear.mutate({ list_id: list.id, scope: 'checked' })}
            disabled={checked.length === 0}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            Clear checked
          </button>
          <button
            onClick={() => {
              if (items.length && confirm('Remove all items from this list?'))
                clear.mutate({ list_id: list.id, scope: 'all' });
            }}
            disabled={items.length === 0}
            className="rounded-md border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-50"
          >
            Clear all
          </button>
        </div>
      </header>

      <div className="border-b border-slate-800 p-3">
        <AddItem listId={list.id} />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {isError && <p className="text-sm text-rose-400">Couldn’t load items.</p>}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-slate-500">No items yet. Add one above.</p>
        )}

        {unchecked.length > 0 && (
          <div className="space-y-2">
            {unchecked.map((it) => (
              <ShoppingItem key={it.id} item={it} />
            ))}
          </div>
        )}

        {checked.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              In cart ({checked.length})
            </div>
            {checked.map((it) => (
              <ShoppingItem key={it.id} item={it} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
