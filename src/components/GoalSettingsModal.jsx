import { useState } from 'react'

export function GoalSettingsModal({ config, onClose, onSave, busy = false }) {
  const [value, setValue] = useState(String(config.value ?? ''))

  function handleSubmit(event) {
    event.preventDefault()
    const numericValue = Number.parseInt(value, 10)
    if (!Number.isFinite(numericValue)) return
    onSave(Math.min(config.max, Math.max(config.min, numericValue)))
  }

  return (
    <section className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center" onClick={busy ? undefined : onClose}>
      <form className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="text-xl font-semibold text-ink">{config.title}</h2>
        <p className="mt-2 text-sm text-slate-600">{config.description}</p>

        <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="goal-value">
          {config.label}
        </label>
        <input
          id="goal-value"
          className="mt-2 w-full rounded-3xl border border-sand bg-white px-4 py-4 text-lg text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          type="number"
          min={config.min}
          max={config.max}
          step="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={busy}
          inputMode="numeric"
        />

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="rounded-3xl bg-white px-4 py-4 font-medium text-slate-700" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="rounded-3xl bg-accent px-4 py-4 font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </section>
  )
}
