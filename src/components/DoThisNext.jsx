import { useState } from 'react'
import { useTasks, SNOOZE_OPTIONS } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'
import {
  sortByPriority,
  getActiveTasks,
  formatDueContext,
  isOverdue,
} from '../utils/prioritization'

const DoThisNext = ({ focusMode = false }) => {
  const { tasks, completeTask, snoozeTask } = useTasks()
  const { currentUser, partnerProfile } = useAuth()
  const [showSnooze, setShowSnooze] = useState(false)
  const [completing, setCompleting] = useState(false)

  const myActive = getActiveTasks(tasks).filter(
    (t) => t.assignedTo === currentUser?.uid
  )
  const sorted = sortByPriority(myActive, currentUser?.uid)
  const task = sorted[0] || null

  if (!task) {
    return (
      <div className="bg-slate-800/60 rounded-2xl p-5 text-center">
        <p className="text-slate-400 text-sm">Nothing left. You're clear.</p>
      </div>
    )
  }

  const isRequestedByMe = task.requestedBy === currentUser?.uid
  const requesterLine = isRequestedByMe
    ? 'You added this'
    : `Requested by ${partnerProfile?.name || 'Partner'}`
  const dueContext = formatDueContext(task)
  const overdue = isOverdue(task)

  const handleDone = async () => {
    setCompleting(true)
    await completeTask(task)
    setCompleting(false)
  }

  return (
    <div className={`rounded-2xl p-5 ${overdue ? 'bg-red-950/40 ring-1 ring-red-800/40' : 'bg-slate-800/80'}`}>
      <p className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-3">
        Do this next
      </p>

      <h2 className="text-xl font-semibold text-white leading-snug mb-2">{task.title}</h2>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
        <span className="text-sm text-slate-400">{requesterLine}</span>
        {dueContext && (
          <span className={`text-sm ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
            · {dueContext}
          </span>
        )}
        {task.effort && (
          <span className="text-sm text-slate-500">· {task.effort} lift</span>
        )}
      </div>

      {/* Clarity */}
      {task.clarity && (
        <p className="text-sm text-slate-300 bg-slate-700/50 rounded-xl px-3 py-2.5 mb-4">
          {task.clarity}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleDone}
          disabled={completing}
          className="flex-1 min-h-[48px] py-3 bg-emerald-600 rounded-xl text-white font-semibold text-sm active:bg-emerald-700 disabled:opacity-50"
        >
          {completing ? 'Done!' : 'Done'}
        </button>
        <button
          onClick={() => setShowSnooze((v) => !v)}
          className="min-h-[48px] py-3 px-5 bg-slate-700 rounded-xl text-white text-sm active:bg-slate-600"
        >
          Snooze
        </button>
        {!focusMode && (
          <button
            onClick={() => {}}
            className="min-h-[48px] py-3 px-5 bg-slate-700 rounded-xl text-white text-sm active:bg-slate-600"
          >
            Start
          </button>
        )}
      </div>

      {/* Snooze menu */}
      {showSnooze && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">Snooze until</p>
          <div className="grid grid-cols-2 gap-2">
            {SNOOZE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  snoozeTask(task, opt.key)
                  setShowSnooze(false)
                }}
                className="py-3 bg-slate-700 rounded-xl text-sm text-white text-left px-3 min-h-[44px] active:bg-slate-600"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Remaining count */}
      {sorted.length > 1 && !focusMode && (
        <p className="text-xs text-slate-500 mt-3 text-right">
          +{sorted.length - 1} more open
        </p>
      )}
    </div>
  )
}

export default DoThisNext
