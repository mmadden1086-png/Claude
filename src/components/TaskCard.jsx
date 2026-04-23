import { useState } from 'react'
import { format } from 'date-fns'
import { useTasks, SNOOZE_OPTIONS } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'
import {
  formatDueContext,
  getAgingLabel,
  isOverdue,
  isActivelySnoozed,
} from '../utils/prioritization'
import { getRepeatLabel } from '../utils/repeatLogic'

const EFFORT_BADGE = {
  Quick: 'bg-emerald-900/50 text-emerald-400',
  Medium: 'bg-amber-900/50 text-amber-400',
  Heavy: 'bg-red-900/50 text-red-400',
}

const SnoozeMenu = ({ task, onClose }) => {
  const { snoozeTask } = useTasks()
  return (
    <div className="pt-2">
      <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Snooze until</p>
      <div className="grid grid-cols-2 gap-2">
        {SNOOZE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={async () => {
              await snoozeTask(task, opt.key)
              onClose()
            }}
            className="py-3 px-3 bg-slate-700 rounded-xl text-sm text-white text-left active:bg-slate-600 min-h-[44px]"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const TaskCard = ({ task, showAging = true, highlight = false }) => {
  const [expanded, setExpanded] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)

  const { completeTask, acknowledgeTask, moveToTomorrow, skipRepeat, pauseRepeat, deleteTask } =
    useTasks()
  const { currentUser, partnerProfile } = useAuth()

  const isAssignedToMe = task.assignedTo === currentUser?.uid
  const isRequestedByMe = task.requestedBy === currentUser?.uid

  const partnerName = partnerProfile?.name || 'Partner'

  const requesterLine = isRequestedByMe ? 'You added this' : `Requested by ${partnerName}`
  const assigneeLine = isAssignedToMe
    ? "You're handling this"
    : `${partnerName} is handling this`

  const dueContext = formatDueContext(task)
  const agingLabel = getAgingLabel(task)
  const repeatLabel = getRepeatLabel(task)
  const overdue = isOverdue(task)
  const snoozed = isActivelySnoozed(task)
  const needsAck = !task.acknowledgedAt && task.assignedTo === currentUser?.uid && !isRequestedByMe

  const ageDays =
    task.createdAt instanceof Date
      ? Math.floor((Date.now() - task.createdAt) / 86400000)
      : 0
  const isOld = ageDays >= 5

  return (
    <div
      className={`rounded-2xl p-4 mb-3 transition-colors ${
        highlight
          ? 'bg-slate-700/80 ring-1 ring-slate-500/40'
          : overdue
          ? 'bg-red-950/30 ring-1 ring-red-900/30'
          : snoozed
          ? 'bg-slate-800/30'
          : 'bg-slate-800/60'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Complete button */}
        <button
          onClick={() => completeTask(task)}
          className="w-7 h-7 rounded-full border-2 border-slate-500 flex-shrink-0 mt-0.5 flex items-center justify-center active:border-emerald-500 active:bg-emerald-500/20"
          aria-label="Mark complete"
        >
          <span className="sr-only">Done</span>
        </button>

        {/* Main content */}
        <div className="flex-1 min-w-0" onClick={() => setExpanded((v) => !v)}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-white font-medium leading-snug text-[15px]">{task.title}</h3>
            {task.effort && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
                  EFFORT_BADGE[task.effort] || 'bg-slate-700 text-slate-400'
                }`}
              >
                {task.effort}
              </span>
            )}
          </div>

          {/* Due + overdue */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {dueContext && (
              <span className={`text-sm ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
                {dueContext}
              </span>
            )}
            {needsAck && (
              <span className="text-xs text-blue-400 font-medium">· Needs acknowledgement</span>
            )}
          </div>

          {/* Attribution */}
          <div className="flex flex-wrap gap-x-2 mt-1">
            <span className="text-xs text-slate-500">{requesterLine}</span>
            {!isAssignedToMe && (
              <span className="text-xs text-slate-500">· {assigneeLine}</span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <div className="pt-1 text-slate-600 text-xs select-none">{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-2 mt-2 pl-10">
        {repeatLabel && (
          <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
            {repeatLabel}
          </span>
        )}
        {showAging && agingLabel && (
          <span className={`text-xs ${isOld ? 'text-amber-500' : 'text-slate-500'}`}>
            {agingLabel}
          </span>
        )}
        {snoozed && task.snoozedUntil && (
          <span className="text-xs text-slate-500">
            Snoozed until {format(task.snoozedUntil, 'MMM d, h:mm a')}
          </span>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="pl-10 mt-3 space-y-3">
          {/* Detail fields */}
          {task.clarity && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Done looks like</p>
              <p className="text-sm text-slate-300">{task.clarity}</p>
            </div>
          )}
          {task.notes && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-sm text-slate-300">{task.notes}</p>
            </div>
          )}
          {task.whyThisMatters && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Why it matters</p>
              <p className="text-sm text-slate-300">{task.whyThisMatters}</p>
            </div>
          )}

          {/* Primary actions */}
          <div className="flex flex-wrap gap-2">
            {needsAck && (
              <button
                onClick={() => acknowledgeTask(task.id)}
                className="min-h-[44px] py-2 px-4 bg-blue-600 rounded-xl text-sm text-white font-medium active:bg-blue-700"
              >
                Got it
              </button>
            )}
            <button
              onClick={() => setShowSnooze((v) => !v)}
              className="min-h-[44px] py-2 px-4 bg-slate-700 rounded-xl text-sm text-white active:bg-slate-600"
            >
              Snooze
            </button>
            <button
              onClick={() => moveToTomorrow(task)}
              className="min-h-[44px] py-2 px-4 bg-slate-700 rounded-xl text-sm text-white active:bg-slate-600"
            >
              Tomorrow
            </button>
          </div>

          {/* Repeat actions */}
          {task.repeatType && task.repeatType !== 'none' && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => skipRepeat(task)}
                className="min-h-[44px] py-2 px-3 bg-slate-700/60 rounded-xl text-sm text-slate-300 active:bg-slate-600"
              >
                Skip this time
              </button>
              <button
                onClick={() => pauseRepeat(task.id)}
                className="min-h-[44px] py-2 px-3 bg-slate-700/60 rounded-xl text-sm text-slate-300 active:bg-slate-600"
              >
                Pause repeat
              </button>
            </div>
          )}

          {/* Snooze menu */}
          {showSnooze && <SnoozeMenu task={task} onClose={() => setShowSnooze(false)} />}

          {/* Expectation check for old tasks */}
          {isOld && (
            <div className="p-3 bg-amber-900/20 rounded-xl border border-amber-900/30">
              <p className="text-sm text-amber-300 mb-2">Still needed?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => moveToTomorrow(task)}
                  className="text-sm text-blue-400 min-h-[44px] flex items-center"
                >
                  Adjust timing
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-sm text-red-400 min-h-[44px] flex items-center"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TaskCard
