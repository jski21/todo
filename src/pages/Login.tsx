import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function LoginPage() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await signInWithEmail(email.trim());
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {sent ? (
          <p className="text-sm text-slate-300">Check your email for a magic link.</p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-brand-500 focus:outline-none"
                placeholder="you@example.com"
              />
            </label>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
