import { useState } from 'react'
import { getHours, isToday, addDays, startOfDay, parseISO } from 'date-fns'
import { useTasks } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'
import { getActiveTasks, isDueToday } from '../utils/prioritization'

const EveningWrapUp = () => {
  const hour = getHours(new Date())
  const show = hour >= 18 && hour < 23

  const { tasks, moveToTomorrow, completeTask } = useTasks()
  const { currentUser } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  if (!show || dismissed) return null

  const todayTasks = getActiveTasks(tasks).filter(
    (t) => t.assignedTo === currentUser?.uid && isDueToday(t)
  )

  const allActive = getActiveTasks(tasks).filter(
    (t) => t.assignedTo === currentUser?.uid
  )

  const handleMoveAll = async () => {
    await Promise.all(todayTasks.map((t) => moveToTomorrow(t)))
    setDismissed(true)
  }

  return (
    <div className="bg-slate-700/50 rounded-2xl p-4 border border-slate-600/30">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">
          Evening wrap-up
        </p>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-500 text-lg leading-none min-h-[44px] min-w-[44px] flex items-center justify-end"
        >
          ×
        </button>
      </div>

      <p className="text-white text-[15px] font-medium mb-1">
        {allActive.length} still open.
        {todayTasks.length > 0
          ? ' Quick win before tomorrow?'
          : ' Clear day ahead.'}
      </p>

      {todayTasks.length > 0 && (
        <p className="text-sm text-slate-400 mb-3">
          {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} due today
        </p>
      )}

      {todayTasks.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleMoveAll}
            className="py-2.5 px-4 bg-slate-700 rounded-xl text-sm text-white min-h-[44px] active:bg-slate-600"
          >
            Move all to tomorrow
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="py-2.5 px-4 bg-slate-700/60 rounded-xl text-sm text-slate-400 min-h-[44px] active:bg-slate-600"
          >
            Leave as-is
          </button>
        </div>
      )}
    </div>
  )
}

export default EveningWrapUp
