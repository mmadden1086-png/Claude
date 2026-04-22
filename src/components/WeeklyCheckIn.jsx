import { useState } from 'react'
import { isThisWeek, differenceInDays } from 'date-fns'
import { useTasks } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'

const WeeklyCheckIn = ({ onClose }) => {
  const { tasks } = useTasks()
  const { userProfile, partnerProfile } = useTasks()

  const completedThisWeek = tasks.filter(
    (t) =>
      t.isCompleted &&
      t.completedAt instanceof Date &&
      isThisWeek(t.completedAt, { weekStartsOn: 0 })
  )

  const totalOpen = tasks.filter((t) => !t.isCompleted).length
  const oldTasks = tasks.filter((t) => {
    if (t.isCompleted) return false
    const age = t.createdAt instanceof Date ? differenceInDays(new Date(), t.createdAt) : 0
    return age >= 7
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
      <div className="bg-slate-800 rounded-t-3xl w-full max-w-lg p-6 pb-10 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Weekly Check-In</h2>
          <button
            onClick={onClose}
            className="text-slate-400 text-2xl min-h-[44px] min-w-[44px] flex items-center justify-end"
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-700/60 rounded-2xl p-4">
            <p className="text-2xl font-bold text-emerald-400">{completedThisWeek.length}</p>
            <p className="text-sm text-slate-400 mt-0.5">Handled this week</p>
          </div>
          <div className="bg-slate-700/60 rounded-2xl p-4">
            <p className="text-2xl font-bold text-white">{totalOpen}</p>
            <p className="text-sm text-slate-400 mt-0.5">Still open</p>
          </div>
        </div>

        {/* Old tasks warning */}
        {oldTasks.length > 0 && (
          <div className="bg-amber-900/30 border border-amber-800/40 rounded-2xl p-4">
            <p className="text-sm text-amber-300 font-medium mb-1">
              {oldTasks.length} task{oldTasks.length !== 1 ? 's' : ''} sitting for 7+ days
            </p>
            <p className="text-sm text-slate-400">
              Consider adjusting timing or removing what's no longer needed.
            </p>
          </div>
        )}

        {/* Prompt */}
        <div className="space-y-2">
          <p className="text-sm text-slate-300 font-medium">This week's focus:</p>
          <textarea
            placeholder="What do you want to get done together?"
            rows={3}
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
          />
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 bg-blue-600 rounded-xl text-white font-semibold min-h-[48px] active:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  )
}

export default WeeklyCheckIn
