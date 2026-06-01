import { useRef, useState } from 'react';
import { useAddShoppingItem, useProductSearch } from '@/hooks/useShopping';
import type { Product } from '@/types/db';

export function AddItem({ listId }: { listId: string }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [open, setOpen] = useState(false);
  const addItem = useAddShoppingItem();
  const { data: suggestions = [] } = useProductSearch(name);
  const blurTimer = useRef<number | undefined>(undefined);

  async function submit(product?: Product) {
    const finalName = (product?.name ?? name).trim();
    if (!finalName) return;
    setOpen(false);
    await addItem.mutateAsync({
      list_id: listId,
      name: finalName,
      quantity: Number(qty) || 1,
      unit: unit.trim() || null,
      product_id: product?.id ?? null,
    });
    setName('');
    setQty('1');
    setUnit('');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="relative"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setOpen(false), 150);
            }}
            placeholder="Add an item…"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
          />
          {open && name.trim() && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // prevent input blur from cancelling before click
                      e.preventDefault();
                      window.clearTimeout(blurTimer.current);
                      void submit(p);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    {p.name}
                    {p.brand ? <span className="ml-1 text-slate-500">{p.brand}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          inputMode="decimal"
          aria-label="Quantity"
          className="w-14 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-center text-sm text-slate-100"
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="unit"
          aria-label="Unit"
          className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
        />
        <button
          type="submit"
          disabled={addItem.isPending || !name.trim()}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </form>
  );
}
