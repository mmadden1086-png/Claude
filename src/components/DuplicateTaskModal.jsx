import { X } from 'lucide-react'
import { formatDueContext } from '../lib/format'

export function DuplicateTaskModal({ task, onUpdateExisting, onKeepBoth, onCancel }) {
  return (
    <section className="fixed inset-0 z-50 bg-ink/60 px-4 py-6 backdrop-blur-sm" onClick={onCancel}>
      <div className="mx-auto max-w-md rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">Possible duplicate</h2>
            <p className="mt-1 text-sm text-slate-600">This looks close to an existing task. Choose what to do before saving.</p>
          </div>
          <button className="rounded-full bg-white p-3 text-slate-600" type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 rounded-3xl bg-white px-4 py-4">
          <p className="font-medium text-ink">{task.title}</p>
          <p className="mt-1 text-sm text-slate-500">{formatDueContext(task)}</p>
        </div>

        <div className="mt-4 space-y-3">
          <button className="w-full rounded-3xl bg-accent px-4 py-4 text-left font-semibold text-white" type="button" onClick={onUpdateExisting}>
            Update existing
          </button>
          <button className="w-full rounded-3xl bg-white px-4 py-4 text-left font-medium text-slate-700" type="button" onClick={onKeepBoth}>
            Keep both
          </button>
          <button className="w-full rounded-3xl bg-white px-4 py-4 text-left font-medium text-slate-600" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  )
}
