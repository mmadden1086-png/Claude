import { useTasks } from '../contexts/TaskContext'

const ToastContainer = () => {
  const { toasts, dismissToast, triggerUndo } = useTasks()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-24 inset-x-0 flex flex-col items-center gap-2 z-50 px-4 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 bg-slate-700 text-white px-4 py-3 rounded-2xl shadow-xl pointer-events-auto w-full max-w-sm"
        >
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          {toast.undoKey && (
            <button
              onClick={() => triggerUndo(toast.undoKey)}
              className="text-blue-400 text-sm font-semibold shrink-0 min-h-[44px] px-1 flex items-center"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => dismissToast(toast.id)}
            className="text-slate-400 text-xl leading-none shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
