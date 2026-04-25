import { TASK_STATUS } from '../lib/constants'
import { getTaskStatus } from '../lib/format'
import { TaskCard } from '../components/TaskCard'

export function FocusPage({
  sections,
  currentUser,
  filteredTasks,
  focusGoalMessage,
  monthlyDateStatus,
  accountabilityBanner,
  onOpenDateNight,
  onTaskAction,
  onOpenTask,
  setQuickAddExpanded,
  taskMotionState,
}) {
  const topTask = sections?.topTask ?? null
  const focusTask = sections?.focusTask ?? topTask
  const primaryTaskId = focusTask?.parentTaskId ?? focusTask?.id
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div className="rounded-[1.75rem] border border-white/70 bg-panel/95 p-4 shadow-card">
              <h1 className="text-2xl font-semibold text-ink">No tasks right now</h1>
              <div className="mt-4 flex gap-2 flex-wrap">
                <button className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-semibold text-white transition duration-150 active:scale-[0.98] sm:flex-1" type="button" onClick={() => setQuickAddExpanded?.(true)}>
                  Add task
                </button>
                <button
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition duration-150 active:scale-[0.98] sm:flex-1"
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
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          {accountabilityBanner ? (
            <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {accountabilityBanner}
            </div>
          ) : null}
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
        </div>
      </div>
    </div>
  )
}
