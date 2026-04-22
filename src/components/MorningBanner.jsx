import { getHours } from 'date-fns'
import { useTasks } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'
import { getActiveTasks, sortByPriority, isOverdue } from '../utils/prioritization'

const MorningBanner = () => {
  const hour = getHours(new Date())
  const show = hour >= 6 && hour < 11

  const { tasks } = useTasks()
  const { currentUser } = useAuth()

  if (!show) return null

  const myActive = getActiveTasks(tasks).filter(
    (t) => t.assignedTo === currentUser?.uid
  )
  const sorted = sortByPriority(myActive, currentUser?.uid)
  const top = sorted[0]
  const overdueCount = myActive.filter(isOverdue).length

  return (
    <div className="bg-gradient-to-r from-slate-700/60 to-slate-800/60 rounded-2xl p-4 mb-1">
      <p className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">
        Good morning
      </p>
      {top ? (
        <>
          <p className="text-white text-[15px] font-medium leading-snug">
            Start here: <span className="text-blue-300">{top.title}</span>
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {myActive.length} open{overdueCount > 0 ? `, ${overdueCount} overdue` : ''}
          </p>
        </>
      ) : (
        <p className="text-slate-300 text-[15px]">Nothing open. Good start.</p>
      )}
    </div>
  )
}

export default MorningBanner
