import { Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TaskCard } from '../components/TaskCard'
import { FocusInsightBanner } from '../components/FocusInsightBanner'
import { getWeeklyCheckInOpening } from '../lib/check-in-review'

const MOOD_LEVELS = [
  { level: 1, emoji: '😔', label: 'Low' },
  { level: 2, emoji: '😕', label: 'Rough' },
  { level: 3, emoji: '😐', label: 'OK' },
  { level: 4, emoji: '🙂', label: 'Good' },
  { level: 5, emoji: '😄', label: 'Great' },
]

function MoodWidget({ currentUser, partner, onSetMoodLevel }) {
  const myLevel = currentUser?.moodLevel ?? null
  const partnerLevel = partner?.moodLevel ?? null
  const partnerName = partner?.name ?? 'Partner'

  return (
    <div className="rounded-3xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">How are you feeling?</p>
      <div className="flex items-center justify-between gap-2">
        {MOOD_LEVELS.map(({ level, emoji, label }) => (
          <button
            key={level}
            type="button"
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-center transition duration-150 active:scale-[0.95] ${
              myLevel === level ? 'bg-accentSoft ring-1 ring-accent/30' : 'bg-canvas'
            }`}
            onClick={() => onSetMoodLevel(level)}
          >
            <span className="text-lg leading-none">{emoji}</span>
            <span className="text-[0.6rem] font-medium text-slate-500">{label}</span>
          </button>
        ))}
      </div>
      {partnerLevel ? (
        <p className="mt-2 text-xs text-slate-500">
          {partnerName} is feeling{' '}
          <span className="font-semibold text-ink">
            {MOOD_LEVELS.find((m) => m.level === partnerLevel)?.label ?? partnerLevel}
          </span>{' '}
          {MOOD_LEVELS.find((m) => m.level === partnerLevel)?.emoji ?? ''}
        </p>
      ) : null}
    </div>
  )
}

function SharedGoalCard({ goal, onEditGoal }) {
  if (!goal?.title) return null
  const target = goal.targetAmount || 0
  const current = Math.min(goal.currentAmount || 0, target)
  const percent = target > 0 ? Math.round((current / target) * 100) : 0

  return (
    <button
      type="button"
      className="w-full rounded-3xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm transition duration-150 active:scale-[0.99]"
      onClick={onEditGoal}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shared goal</p>
        <p className="text-xs font-medium text-slate-400">{percent}%</p>
      </div>
      <p className="mt-1 text-sm font-semibold text-ink">{goal.title}</p>
      {target > 0 ? (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
            <div
              className="h-1.5 rounded-full bg-accent transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            ${current.toLocaleString()} of ${target.toLocaleString()} saved
          </p>
        </>
      ) : null}
    </button>
  )
}

function CheckInBanner({ checkInBanner, onPlanCheckIn, onViewCheckInDetails, onDismissCheckInBanner }) {
  if (!checkInBanner) return null
  return (
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
  )
}

export function FocusPage({
  sections,
  currentUser,
  partner,
  focusGoalMessage,
  monthlyDateStatus,
  accountabilityBanner,
  checkInBanner,
  checkInReview,
  sharedGoal,
  onOpenDateNight,
  onPlanCheckIn,
  onViewCheckInDetails,
  onDismissCheckInBanner,
  onTaskAction,
  onOpenTask,
  onSetMoodLevel,
  onEditSharedGoal,
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
            <CheckInBanner checkInBanner={checkInBanner} onPlanCheckIn={onPlanCheckIn} onViewCheckInDetails={onViewCheckInDetails} onDismissCheckInBanner={onDismissCheckInBanner} />
            <MoodWidget currentUser={currentUser} partner={partner} onSetMoodLevel={onSetMoodLevel} />
            <SharedGoalCard goal={sharedGoal} onEditGoal={onEditSharedGoal} />
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
          <CheckInBanner checkInBanner={checkInBanner} onPlanCheckIn={onPlanCheckIn} onViewCheckInDetails={onViewCheckInDetails} onDismissCheckInBanner={onDismissCheckInBanner} />
          {accountabilityBanner ? (
            <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {accountabilityBanner}
            </div>
          ) : null}
          <FocusInsightBanner insight={checkInReview?.agenda?.length ? { body: getWeeklyCheckInOpening(checkInReview) } : null} />
          <MoodWidget currentUser={currentUser} partner={partner} onSetMoodLevel={onSetMoodLevel} />
          <SharedGoalCard goal={sharedGoal} onEditGoal={onEditSharedGoal} />
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
          {focusTask?.protected ? (
            <div className="px-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                <Shield size={10} /> Protected self-care
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
