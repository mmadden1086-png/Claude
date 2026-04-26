import { useNavigate } from 'react-router-dom'
import { TaskCard } from '../components/TaskCard'

export function FocusPage({
  sections,
  currentUser,
  focusGoalMessage,
  monthlyDateStatus,
  accountabilityBanner,
  checkInBanner,
  onOpenDateNight,
  onPlanCheckIn,
  onViewCheckInDetails,
  onDismissCheckInBanner,
  onTaskAction,
  onOpenTask,
  setQuickAddExpanded,
  taskMotionState,
}) {
  const navigate = useNavigate()
  const topTask = sections?.topTask ?? null
  const focusTask = sections?.focusTask ?? topTask
  const primaryTaskId = focusTask?.parentTaskId ?? focusTask?.id
  const whyLabel = focusTask?._surfaceReason ?? ''
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
    onOpenTask(resolvedId)
  }

  if (!focusTask) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            {checkInBanner ? (
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                <p className="font-medium text-ink">{checkInBanner.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    className="text-sm font-semibold text-accent underline-offset-4 transition hover:underline active:scale-[0.98]"
                    type="button"
                    onClick={checkInBanner.status === 'scheduled' ? onViewCheckInDetails : onPlanCheckIn}
                  >
                    {checkInBanner.cta}
                  </button>
                  <button
                    className="text-sm font-medium text-slate-500 underline-offset-4 transition hover:underline active:scale-[0.98]"
                    type="button"
                    onClick={onDismissCheckInBanner}
                  >
                    Dismiss today
                  </button>
                </div>
              </div>
            ) : null}
            <div className="rounded-[1.75rem] border border-white/70 bg-panel/95 p-4 shadow-card">
              <h1 className="text-2xl font-semibold text-ink">You're all caught up</h1>
              <p className="mt-2 text-sm text-slate-500">Nothing active right now. Add something new or browse what's waiting.</p>
              <div className="mt-4 flex flex-col gap-2">
                <button className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]" type="button" onClick={() => setQuickAddExpanded?.(true)}>
                  Add a task
                </button>
                <button
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700 transition duration-150 active:scale-[0.98]"
                  type="button"
                  onClick={() => {
                    const fallbackQuickWin = sections?.quickWinTasks?.[0]
                    if (fallbackQuickWin) {
                      onOpenTask(fallbackQuickWin.id)
                      return
                    }
                    navigate('/tasks')
                  }}
                >
                  {sections?.quickWinTasks?.length ? 'Pick a quick win' : 'View all tasks'}
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
          {checkInBanner ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              <p className="font-medium text-ink">{checkInBanner.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  className="text-sm font-semibold text-accent underline-offset-4 transition hover:underline active:scale-[0.98]"
                  type="button"
                  onClick={checkInBanner.status === 'scheduled' ? onViewCheckInDetails : onPlanCheckIn}
                >
                  {checkInBanner.cta}
                </button>
                <button
                  className="text-sm font-medium text-slate-500 underline-offset-4 transition hover:underline active:scale-[0.98]"
                  type="button"
                  onClick={onDismissCheckInBanner}
                >
                  Dismiss today
                </button>
              </div>
            </div>
          ) : null}
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
          {whyLabel ? (
            <div className="px-1">
              <span className="inline-block rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500">
                {whyLabel}
              </span>
            </div>
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
