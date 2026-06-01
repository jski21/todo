import { useState } from 'react';
import { DateTime } from 'luxon';
import { useCreateTask } from '@/hooks/useTasks';
import { useTimezone } from '@/hooks/useProfile';

export function QuickAdd({ defaultDate }: { defaultDate?: string }) {
  const [text, setText] = useState('');
  const createTask = useCreateTask();
  const zone = useTimezone();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const date = defaultDate ?? DateTime.now().setZone(zone).toISODate() ?? '';
    await createTask.mutateAsync({
      title: trimmed,
      date,
      is_recurring: false,
    });
    setText('');
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        placeholder="Add a task and press Enter…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-brand-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={createTask.isPending || !text.trim()}
        className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        Add
      </button>
    </form>
  );
}
