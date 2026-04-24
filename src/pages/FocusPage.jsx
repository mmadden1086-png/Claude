import { differenceInHours } from 'date-fns'
import { TASK_STATUS } from '../lib/constants'
import { getTaskStatus, isOverdue, toDate } from '../lib/format'
import { TaskCard } from '../components/TaskCard'

function hasUserInactivity(filteredTasks) {
  const lastTouched = filteredTasks
    .map((task) => toDate(task.lastActionAt ?? task.createdAt))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  if (!lastTouched) return true
  return differenceInHours(new Date(), lastTouched) >= 72
}

export function FocusPage({
  sections,
  currentUser,
  filteredTasks,
  lowEnergyMode,
  focusGoalMessage,
  monthlyDateStatus,
  onOpenDateNight,
  onTaskAction,
  onOpenTask,
  setQuickAddExpanded,
  taskMotionState,
}) {
  const topTask = sections?.topTask ?? null
  const focusTask = sections?.focusTask ?? topTask
  const primaryTaskId = focusTask?.parentTaskId ?? focusTask?.id
  const inProgressTask = filteredTasks.find((task) => getTaskStatus(task) === TASK_STATUS.IN_PROGRESS && task.id !== primaryTaskId)
  const quickWin = sections?.quickWinTasks?.find((task) => task.id !== primaryTaskId)
  const showQuickWin = Boolean(quickWin) && (lowEnergyMode || !inProgressTask && (isOverdue(topTask ?? {}) || hasUserInactivity(filteredTasks)))
  const secondaryTask = inProgressTask ?? (showQuickWin ? quickWin : null)
  const guidance = !monthlyDateStatus?.hasPlannedDate && !monthlyDateStatus?.hasCompletedDate
    ? {
        text: monthlyDateStatus?.midMonthReminder ? "You haven't planned a date night this month" : 'Plan a date night this month',
        onClick: onOpenDateNight,
      }
    : focusGoalMessage
      ? { text: focusGoalMessage, onClick: null }
      : null

  function handlePrimaryOpen(taskId) {
    const resolvedId = focusTask?.isBrokenDown ? focusTask.parentTaskId : taskId
    const task = filteredTasks.find((item) => item.id === resolvedId)
    if (!task) return
    if (getTaskStatus(task) === TASK_STATUS.NOT_STARTED) {
      onTaskAction('start', task, { source: 'focus' })
      return
    }
    onOpenTask(resolvedId)
  }

  if (!focusTask) {
    return (
      <div className="space-y-4">
        <div className="rounded-[2rem] border border-white/70 bg-panel/95 p-6 shadow-card">
          <h1 className="text-2xl font-semibold text-ink">No tasks right now</h1>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button className="rounded-2xl bg-accent px-4 py-4 text-sm font-semibold text-white" type="button" onClick={() => setQuickAddExpanded?.(true)}>
              Add task
            </button>
            <button
              className="rounded-2xl bg-white px-4 py-4 text-sm font-semibold text-slate-700"
              type="button"
              onClick={() => {
                const fallbackQuickWin = sections?.quickWinTasks?.[0]
                if (fallbackQuickWin) {
                  onOpenTask(fallbackQuickWin.id)
                  return
                }
                setQuickAddExpanded?.(true)
              }}
            >
              Pick quick win
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {guidance ? (
        guidance.onClick ? (
          <button className="inline-flex px-1 text-sm font-medium text-slate-500 underline-offset-4 transition hover:text-accent hover:underline" type="button" onClick={guidance.onClick}>
            {guidance.text}
          </button>
        ) : (
          <p className="px-1 text-sm font-medium text-slate-500">{guidance.text}</p>
        )
      ) : null}
      <div key={primaryTaskId} className="ft-focus-swap">
        <TaskCard
          task={focusTask}
          currentUser={currentUser}
          onAction={onTaskAction}
          onOpen={handlePrimaryOpen}
          highlight
          variant="focus"
          messageOverride={sections?.topTaskMessage}
          focusBadge={focusTask?.breakdownLabel ?? ''}
          referenceTitle={focusTask?.isBrokenDown ? focusTask.originalTitle : ''}
          motionState={taskMotionState?.(primaryTaskId)}
        />
      </div>

      {secondaryTask ? (
        <div key={secondaryTask.id} className="ft-enter-up space-y-2 pt-1">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {inProgressTask ? 'Already in progress' : 'Quick win'}
          </p>
          <TaskCard task={secondaryTask} currentUser={currentUser} onAction={onTaskAction} onOpen={onOpenTask} variant="list" motionState={taskMotionState?.(secondaryTask.id)} />
        </div>
      ) : null}
    </div>
  )
}
