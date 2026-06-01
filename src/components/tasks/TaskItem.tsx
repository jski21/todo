import { useSetOccurrenceStatus } from '@/hooks/useTasks';
import { formatTime12 } from '@/lib/dates';
import { describeRRule } from '@/lib/recurrence';
import type { OccurrenceWithTask } from '@/types/db';

interface Props {
  occurrence: OccurrenceWithTask;
  onClick?: () => void;
}

export function TaskItem({ occurrence, onClick }: Props) {
  const setStatus = useSetOccurrenceStatus();
  const isDone = occurrence.status === 'done';
  const task = occurrence.task;
  const title = occurrence.override_title ?? task.title;
  const time = occurrence.override_time ?? task.due_time ?? null;

  return (
    <div
      className={`flex items-start gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-3 transition ${
        isDone ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        aria-label={isDone ? 'Mark not done' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation();
          setStatus.mutate({ id: occurrence.id, status: isDone ? 'pending' : 'done' });
        }}
        className={`task-check mt-0.5 ${isDone ? 'done' : ''}`}
      >
        {isDone ? (
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor">
            <path d="M7.5 13.5l-3-3 1-1 2 2 5-5 1 1-6 6z" />
          </svg>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onClick}
        className="flex-1 text-left"
      >
        <div className={`text-sm font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-100'}`}>
          {title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {time && <span>{formatTime12(time)}</span>}
          {task.is_recurring && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5">
              ↻ {describeRRule(task.rrule, task.dtstart)}
            </span>
          )}
          {occurrence.is_exception && (
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-200">override</span>
          )}
        </div>
      </button>
    </div>
  );
}
