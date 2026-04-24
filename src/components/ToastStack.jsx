export function ToastStack({ toasts, onUndo, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 mx-auto flex max-w-md flex-col gap-3 px-4">
      {toasts.map((toast) => (
        <div key={toast.id} className="ft-enter-up pointer-events-auto rounded-3xl bg-ink px-4 py-3 text-white shadow-card">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{toast.message}</p>
            {toast.undo ? (
              <button className="text-sm font-semibold text-amber-200" type="button" onClick={() => onUndo(toast)}>
                Undo
              </button>
            ) : null}
          </div>
          {toast.undo ? (
            <button className="mt-2 text-xs text-white/70" type="button" onClick={() => onDismiss(toast.id)}>
              Dismiss
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
