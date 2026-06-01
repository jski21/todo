import { useState } from 'react';
import {
  useDeleteShoppingItem,
  useToggleShoppingItem,
  useUpdateShoppingItem,
} from '@/hooks/useShopping';
import type { ShoppingListItem } from '@/types/db';

// Trim trailing zeros so 2 doesn't show as "2.00".
function fmtQty(n: number): string {
  return Number(n).toString();
}

export function ShoppingItem({ item }: { item: ShoppingListItem }) {
  const toggle = useToggleShoppingItem();
  const update = useUpdateShoppingItem();
  const del = useDeleteShoppingItem();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit ?? '');

  const checked = item.checked;

  function setQty(next: number) {
    if (next < 1) return;
    update.mutate({ id: item.id, list_id: item.list_id, quantity: next });
  }

  function saveEdit() {
    setEditing(false);
    update.mutate({
      id: item.id,
      list_id: item.list_id,
      name: name.trim() || item.name,
      unit: unit.trim() || null,
    });
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-2.5 ${
        checked ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        aria-label={checked ? 'Uncheck' : 'Check'}
        onClick={() => toggle.mutate({ id: item.id, list_id: item.list_id, checked: !checked })}
        className={`task-check ${checked ? 'done' : ''}`}
      >
        {checked ? (
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
            <path d="M7.5 13.5l-3-3 1-1 2 2 5-5 1 1-6 6z" />
          </svg>
        ) : null}
      </button>

      {editing ? (
        <div className="flex flex-1 gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="unit"
            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
            className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <button onClick={saveEdit} className="text-xs text-brand-400 hover:text-brand-300">
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setName(item.name);
            setUnit(item.unit ?? '');
            setEditing(true);
          }}
          className="flex-1 text-left"
        >
          <span className={`text-sm ${checked ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
            {item.name}
          </span>
          {item.unit && <span className="ml-1 text-xs text-slate-500">{item.unit}</span>}
        </button>
      )}

      {!editing && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty(Number(item.quantity) - 1)}
            className="h-6 w-6 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            −
          </button>
          <span className="w-6 text-center text-sm tabular-nums">{fmtQty(item.quantity)}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty(Number(item.quantity) + 1)}
            className="h-6 w-6 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            +
          </button>
        </div>
      )}

      <button
        type="button"
        aria-label="Delete item"
        onClick={() => del.mutate({ id: item.id, list_id: item.list_id })}
        className="text-slate-500 hover:text-rose-400"
      >
        ✕
      </button>
    </div>
  );
}
