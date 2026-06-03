import { useEffect, useState } from 'react';
import { useEnqueuePrint, type PrintJobType } from '@/hooks/usePrint';

interface Props {
  request: PrintJobType;
  label?: string;
  className?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function PrintButton({
  request,
  label = 'Print',
  className,
  disabled,
  variant = 'secondary',
}: Props) {
  const enqueue = useEnqueuePrint();
  const [feedback, setFeedback] = useState<'idle' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (feedback === 'idle') return;
    const t = setTimeout(() => {
      setFeedback('idle');
      setErrorMsg(null);
    }, 2500);
    return () => clearTimeout(t);
  }, [feedback]);

  const base = 'rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-60';
  const variants: Record<NonNullable<Props['variant']>, string> = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-slate-700 text-slate-200 hover:bg-slate-800',
    ghost: 'text-slate-300 hover:text-slate-100',
  };

  async function onClick() {
    setErrorMsg(null);
    try {
      await enqueue.mutateAsync(request);
      setFeedback('sent');
    } catch (e) {
      setFeedback('error');
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const text =
    feedback === 'sent'
      ? 'Sent ✓'
      : feedback === 'error'
        ? 'Failed'
        : enqueue.isPending
          ? 'Queuing…'
          : label;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || enqueue.isPending}
        className={`${base} ${variants[variant]} ${className ?? ''}`}
        title={errorMsg ?? undefined}
      >
        {text}
      </button>
      {feedback === 'error' && errorMsg && (
        <span className="max-w-xs truncate text-xs text-rose-400">{errorMsg}</span>
      )}
    </span>
  );
}
