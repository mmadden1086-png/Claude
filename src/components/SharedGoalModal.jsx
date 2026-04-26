import { useState } from 'react'

export function SharedGoalModal({ goal, onClose, onSave, busy = false }) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? '')
  const [currentAmount, setCurrentAmount] = useState(goal?.currentAmount ?? '')

  function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) return
    const target = Number.parseFloat(targetAmount) || 0
    const current = Number.parseFloat(currentAmount) || 0
    onSave({ title: title.trim(), targetAmount: target, currentAmount: Math.min(current, target) })
  }

  return (
    <section
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-[1.75rem] bg-panel p-6 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-ink">{goal ? 'Edit shared goal' : 'Add a shared goal'}</h2>
        <p className="mt-1 text-sm text-slate-500">Track a financial target together — visible to both of you.</p>
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Goal name</span>
            <input
              className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              type="text"
              placeholder="e.g. Emergency fund, Vacation, New car"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Target ($)</span>
              <input
                className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                type="number"
                min="0"
                step="1"
                placeholder="5000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Saved so far ($)</span>
              <input
                className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-7 space-y-3">
            <button
              className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700 transition duration-150 active:scale-[0.99]"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="w-full rounded-3xl bg-accent px-4 py-4 font-medium text-white transition duration-150 active:scale-[0.99] disabled:opacity-60"
              type="submit"
              disabled={busy || !title.trim()}
            >
              {busy ? 'Saving…' : 'Save goal'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
