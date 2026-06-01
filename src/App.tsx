import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { hasSupabaseConfig } from '@/lib/supabase';
import { Shell } from '@/components/layout/Shell';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { CalendarPage } from '@/pages/Calendar';
import { ListsPage } from '@/pages/Lists';
import { ShoppingPage } from '@/pages/Shopping';
import { SettingsPage } from '@/pages/Settings';

export default function App() {
  const { user, loading } = useAuth();

  if (!hasSupabaseConfig) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-amber-700 bg-amber-950/40 p-6 text-amber-100">
          <h1 className="mb-2 text-lg font-semibold">Supabase not configured</h1>
          <p className="text-sm">
            Copy <code>.env.example</code> to <code>.env</code> and set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-slate-400">Loading…</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
