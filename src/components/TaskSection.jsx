import { useState } from 'react'
import TaskCard from './TaskCard'

const TaskSection = ({
  title,
  tasks,
  emptyMessage = null,
  defaultOpen = true,
  showAging = true,
  highlightFirst = false,
}) => {
  const [open, setOpen] = useState(defaultOpen)

  if (!tasks.length && !emptyMessage) return null

  return (
    <div className="mb-2">
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-2 px-1 text-left min-h-[44px]"
      >
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          {title}
        </span>
        <div className="flex items-center gap-2">
          {tasks.length > 0 && (
            <span className="text-xs text-slate-600 font-medium">{tasks.length}</span>
          )}
          <span className="text-slate-600 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <>
          {tasks.length === 0 && emptyMessage ? (
            <p className="text-sm text-slate-500 px-1 pb-2">{emptyMessage}</p>
          ) : (
            tasks.map((task, i) => (
              <TaskCard
                key={task.id}
                task={task}
                showAging={showAging}
                highlight={highlightFirst && i === 0}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

export default TaskSection
