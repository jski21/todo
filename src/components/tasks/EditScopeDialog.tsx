export type EditScope = 'one' | 'future' | 'all';

interface Props {
  open: boolean;
  mode: 'edit' | 'delete';
  onPick: (scope: EditScope) => void;
  onCancel: () => void;
}

export function EditScopeDialog({ open, mode, onPick, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">
          {mode === 'edit' ? 'Edit recurring task' : 'Delete recurring task'}
        </h2>
        <p className="mb-3 text-sm text-slate-400">
          Which occurrences should this apply to?
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onPick('one')}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm hover:bg-slate-800"
          >
            This occurrence only
          </button>
          <button
            onClick={() => onPick('future')}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm hover:bg-slate-800"
          >
            This and following occurrences
          </button>
          <button
            onClick={() => onPick('all')}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm hover:bg-slate-800"
          >
            All occurrences in the series
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
