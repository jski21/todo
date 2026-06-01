import { useEffect, useState } from 'react';
import {
  useCreateShoppingList,
  useDeleteShoppingList,
  useShoppingLists,
  useUpdateShoppingList,
} from '@/hooks/useShopping';
import { ShoppingListDetail } from '@/components/shopping/ShoppingListDetail';

export function ShoppingPage() {
  const { data: lists = [], isLoading } = useShoppingLists();
  const createList = useCreateShoppingList();
  const updateList = useUpdateShoppingList();
  const deleteList = useDeleteShoppingList();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Default-select the first list on desktop once loaded.
  useEffect(() => {
    if (!activeId && lists.length > 0 && window.matchMedia('(min-width: 768px)').matches) {
      setActiveId(lists[0].id);
    }
  }, [lists, activeId]);

  const active = lists.find((l) => l.id === activeId) ?? null;

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[260px_1fr]">
      {/* Sidebar: hidden on mobile when a list is open */}
      <aside
        className={`border-b border-slate-800 p-3 md:border-b-0 md:border-r ${
          active ? 'hidden md:block' : 'block'
        }`}
      >
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Shopping lists
        </h2>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!isLoading && lists.length === 0 && (
          <p className="mb-2 text-sm text-slate-500">No lists yet.</p>
        )}
        {lists.map((l) => (
          <div key={l.id} className="group flex items-center gap-1">
            <button
              onClick={() => setActiveId(l.id)}
              className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${
                activeId === l.id ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              {l.name}
            </button>
            <button
              onClick={() => {
                const next = prompt('Rename list', l.name);
                if (next && next.trim()) updateList.mutate({ id: l.id, name: next.trim() });
              }}
              className="text-xs text-slate-400 opacity-0 hover:text-slate-200 group-hover:opacity-100"
              title="Rename"
            >
              ✎
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete list "${l.name}" and its items?`)) {
                  deleteList.mutate(l.id);
                  if (activeId === l.id) setActiveId(null);
                }
              }}
              className="text-xs text-slate-400 opacity-0 hover:text-rose-300 group-hover:opacity-100"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
        <form
          className="mt-3 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            createList.mutate(name, { onSuccess: (l) => setActiveId(l.id) });
            setNewName('');
          }}
        >
          <input
            placeholder="New list"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <button className="rounded-md bg-brand-600 px-2 py-1 text-sm text-white">+</button>
        </form>
      </aside>

      {/* Detail */}
      <section className={`min-h-0 ${active ? 'block' : 'hidden md:block'}`}>
        {active ? (
          <div className="flex h-full min-h-0 flex-col">
            <button
              onClick={() => setActiveId(null)}
              className="border-b border-slate-800 px-3 py-2 text-left text-sm text-slate-400 hover:text-slate-200 md:hidden"
            >
              ‹ All lists
            </button>
            <div className="min-h-0 flex-1">
              <ShoppingListDetail list={active} />
            </div>
          </div>
        ) : (
          <div className="hidden h-full items-center justify-center text-sm text-slate-500 md:flex">
            Select or create a list.
          </div>
        )}
      </section>
    </div>
  );
}
