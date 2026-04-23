import { X } from 'lucide-react'

export function ActionSheetModal({ title, options, customDate, customLabel, onCustomDateChange, onClose, onSelect }) {
  const showCustomDate = options.some((option) => option.id === 'custom')

  return (
    <section className="fixed inset-0 z-50 bg-ink/60 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-w-md rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <button className="rounded-full bg-white p-3 text-slate-600" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {options.map((option) => (
            <button
              key={option.id}
              className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700"
              type="button"
              onClick={() => onSelect(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {showCustomDate ? (
          <div className="mt-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{customLabel}</span>
              <input
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                type="date"
                value={customDate}
                onChange={(event) => onCustomDateChange(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>
    </section>
  )
}
