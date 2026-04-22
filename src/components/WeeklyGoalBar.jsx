import { isThisWeek } from 'date-fns'
import { useTasks } from '../contexts/TaskContext'

const WEEKLY_GOAL = 10

const WeeklyGoalBar = () => {
  const { tasks } = useTasks()

  const completedThisWeek = tasks.filter(
    (t) =>
      t.isCompleted &&
      t.completedAt instanceof Date &&
      isThisWeek(t.completedAt, { weekStartsOn: 0 })
  ).length

  const pct = Math.min(100, Math.round((completedThisWeek / WEEKLY_GOAL) * 100))
  const done = completedThisWeek >= WEEKLY_GOAL

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-widest">
          Weekly goal
        </span>
        <span className={`text-sm font-semibold ${done ? 'text-emerald-400' : 'text-white'}`}>
          {completedThisWeek} / {WEEKLY_GOAL} handled
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            done ? 'bg-emerald-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {done && (
        <p className="text-xs text-emerald-400 mt-2">Goal met this week. Nice work.</p>
      )}
    </div>
  )
}

export default WeeklyGoalBar
