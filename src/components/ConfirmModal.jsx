export function ConfirmModal({ title, body, actions, onCancel, busy = false }) {
  const resolvedActions = (actions?.length
    ? actions
    : [
        { label: 'Cancel', onClick: onCancel, tone: 'default' },
        { label: 'Confirm', onClick: () => {}, tone: 'danger' },
      ])
    .slice()
    .sort((a, b) => {
      const rank = { default: 0, primary: 1, danger: 2 }
      return (rank[a.tone] ?? 1) - (rank[b.tone] ?? 1)
    })

  return (
    <section className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center" onClick={busy ? undefined : onCancel}>
      <div className="w-full max-w-md rounded-[1.75rem] bg-panel p-6 shadow-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        {body ? <p className="mt-3 text-base leading-relaxed text-slate-700">{body}</p> : null}
        <div className="mt-7 space-y-4">
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              className={`w-full rounded-3xl px-4 py-4 font-medium transition active:scale-[0.99] ${
                action.tone === 'danger'
                  ? 'bg-danger text-white'
                  : action.tone === 'primary'
                    ? 'bg-accent text-white'
                    : 'bg-white text-slate-700'
              } ${busy || action.disabled ? 'opacity-60' : 'active:opacity-90'} duration-150`}
              type="button"
              disabled={busy || action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
