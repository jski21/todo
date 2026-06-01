import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useRealtime } from '@/hooks/useRealtime';

const NAV = [
  { to: '/', label: 'Today' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/lists', label: 'Lists' },
  { to: '/settings', label: 'Settings' },
];

export function Shell({ children }: { children: ReactNode }) {
  useRealtime();
  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-row gap-1 border-b border-slate-800 bg-slate-900/60 p-2 md:w-56 md:flex-col md:border-b-0 md:border-r md:p-4">
        <div className="hidden px-2 pb-4 text-lg font-semibold text-slate-100 md:block">Todo</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex-1 rounded-md px-3 py-2 text-sm md:flex-none ${
                isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </aside>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
