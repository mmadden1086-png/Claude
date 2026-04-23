export function ConfirmModal({ title, body, actions, onCancel, busy = false }) {
  const resolvedActions = actions?.length
    ? actions
    : [
        { label: 'Cancel', onClick: onCancel, tone: 'default' },
        { label: 'Confirm', onClick: onCancel, tone: 'danger' },
      ]

  return (
    <section className="fixed inset-0 z-50 bg-ink/60 px-4 py-6 backdrop-blur-sm" onClick={busy ? undefined : onCancel}>
      <div className="mx-auto max-w-md rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-5 space-y-2">
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              className={`w-full rounded-3xl px-4 py-4 font-medium transition active:scale-[0.99] ${
                action.tone === 'danger'
                  ? 'bg-danger text-white'
                  : action.tone === 'primary'
                    ? 'bg-accent text-white'
                    : 'bg-white text-slate-700'
              } ${busy || action.disabled ? 'opacity-60' : ''}`}
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
