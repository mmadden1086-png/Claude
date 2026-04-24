import { Check, ChevronRight, Clock3, Play } from 'lucide-react'
import { clsx } from 'clsx'
import { TASK_STATUS } from '../lib/constants'
import { describeRepeat, formatDueContext, formatStatusLabel, getTaskStatus, isDueWithinHours, isOverdue, isSnoozed, nextRepeatLabel } from '../lib/format'
import { shouldShowFrictionFix } from '../lib/task-decision'
import { getWhyDisplayDecision } from '../lib/why-strength'

function getTaskFlags(task) {
  const flags = []

  if (task.isMissed) flags.push({ label: 'Missed', tone: 'danger' })
  if (isOverdue(task)) flags.push({ label: 'Overdue', tone: 'danger' })
  if (!isOverdue(task) && isDueWithinHours(task, 0, 4)) flags.push({ label: 'Due soon', tone: 'amber' })
  if ((task.snoozeCount ?? 0) >= 2 || shouldShowFrictionFix(task)) flags.push({ label: 'Needs attention', tone: 'amber' })
  if (isSnoozed(task)) flags.push({ label: 'Snoozed', tone: 'slate' })

  return flags
}

function pillClass(tone) {
  if (tone === 'danger') return 'bg-rose-50 text-rose-700'
  if (tone === 'amber') return 'bg-amber-50 text-amber-700'
  if (tone === 'accent') return 'bg-accentSoft text-accent'
  return 'bg-slate-100 text-slate-600'
}

function firstLine(value) {
  return value?.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}

function shortImpactMessage(task, currentUser) {
  const whyDecision = getWhyDisplayDecision(task, task.whyThisMatters, currentUser.id)
  const impact = firstLine(whyDecision.text)

  if (!impact && getTaskStatus(task) === TASK_STATUS.COMPLETED) return 'Completed and logged'
  if (!impact) return 'Needs attention soon'
  return impact.length > 96 ? `${impact.slice(0, 93).trim()}...` : impact
}

function listTags(task) {
  const surfaceReason = task._surfaceReason ? { label: task._surfaceReason, tone: 'accent' } : null
  const flagTags = getTaskFlags(task)
  if (surfaceReason && flagTags.length) return [surfaceReason, ...flagTags].slice(0, 2)
  if (surfaceReason) return [surfaceReason]
  if (flagTags.length) return flagTags.slice(0, 2)

  return [
    task.category ? { label: task.category, tone: 'slate' } : null,
    task.effort ? { label: task.effort, tone: 'accent' } : null,
  ].filter(Boolean).slice(0, 2)
}

function meaningfulClarity(task) {
  if (!task.clarity?.trim()) return ''
  if (task.clarity.trim().toLowerCase() === 'task completed and confirmed') return ''
  return task.clarity.trim()
}

export function TaskCard({
  task,
  currentUser,
  onAction,
  onOpen,
  highlight = false,
  variant = 'list',
  messageOverride = '',
  focusBadge = '',
  referenceTitle = '',
  motionState = '',
}) {
  const interactive = typeof onOpen === 'function'
  const status = getTaskStatus(task)
  const whyDecision = getWhyDisplayDecision(task, task.whyThisMatters, currentUser.id)
  const impactMessage = messageOverride || shortImpactMessage(task, currentUser)
  const tags = listTags(task)
  const isFocus = variant === 'focus'
  const clarity = meaningfulClarity(task)
  const repeatText = describeRepeat(task)
  const repeatNextText = nextRepeatLabel(task)

  function handleCardClick() {
    if (isFocus && status === TASK_STATUS.NOT_STARTED) {
      onAction?.('start', task, { source: 'focus' })
      return
    }
    if (!interactive) return
    onOpen(task.id)
  }

  function stopAndRun(event, action) {
    event.stopPropagation()
    onAction(action, task)
  }

  if (!isFocus) {
    return (
      <article
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        className={clsx(
          'ft-card-transition rounded-4xl border bg-white/95 p-4 shadow-sm transition',
          interactive ? 'cursor-pointer hover:border-accent/40 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-accent/30' : '',
          highlight ? 'border-accent/40 shadow-card' : 'border-sand',
          motionState === 'exit' ? 'ft-card-exit' : '',
          motionState === 'pulse' ? 'ft-soft-success' : '',
        )}
        onClick={handleCardClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleCardClick()
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <span key={tag.label} className={clsx('rounded-full px-3 py-1 text-xs font-semibold', pillClass(tag.tone))}>
                  {tag.label}
                </span>
              ))}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {formatStatusLabel(task)}
              </span>
            </div>
            <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-snug text-ink">{task.title}</h3>
            {impactMessage ? <p className="mt-2 line-clamp-1 text-sm text-slate-600">{impactMessage}</p> : null}
            {repeatText || repeatNextText ? (
              <p className="mt-2 text-xs text-slate-500">
                {[repeatText, repeatNextText].filter(Boolean).join(' - ')}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 rounded-3xl bg-canvas px-3 py-2 text-right text-xs font-medium text-slate-600">
            <p>{formatDueContext(task)}</p>
            {interactive ? (
              <p className="mt-2 inline-flex items-center gap-1 text-accent">
                Open <ChevronRight size={14} />
              </p>
            ) : null}
          </div>
        </div>
      </article>
    )
  }

  const primaryAction = status === TASK_STATUS.IN_PROGRESS ? { label: 'Done', action: 'done', icon: Check } : { label: 'Start', action: 'start', icon: Play }
  const secondaryActions = status === TASK_STATUS.IN_PROGRESS
    ? [{ label: 'Snooze', action: 'snooze', icon: Clock3 }]
    : [
        { label: 'Done', action: 'done', icon: Check },
        { label: 'Snooze', action: 'snooze', icon: Clock3 },
      ]

  return (
    <article
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={clsx(
        'ft-card-transition rounded-[2rem] border bg-white/95 p-5 shadow-card transition',
        interactive ? 'cursor-pointer hover:border-accent/40 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-accent/30 active:scale-[0.995]' : '',
        highlight ? 'border-accent/50' : 'border-white/70',
        motionState === 'exit' ? 'ft-card-exit' : '',
        motionState === 'pulse' ? 'ft-soft-success' : '',
      )}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (!interactive) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleCardClick()
        }
      }}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          {focusBadge ? (
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-accent">{focusBadge}</p>
          ) : null}
          <h2 className="text-[1.65rem] font-semibold leading-tight text-ink">{task.title}</h2>
          {impactMessage ? <p className="text-sm text-slate-600">{impactMessage}</p> : null}
          {task.dueTime || task.dueDate ? <p className="text-sm font-medium text-slate-500">{formatDueContext(task)}</p> : null}
        </div>

        {referenceTitle ? (
          <div className="rounded-3xl bg-canvas px-4 py-3 text-sm text-slate-700">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Original task</p>
            <p>{referenceTitle}</p>
          </div>
        ) : null}

        {whyDecision.text ? (
          <p className="text-sm text-slate-600">{whyDecision.text}</p>
        ) : null}

        {clarity ? (
          <div className="rounded-3xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Done when</p>
            <p>{clarity}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-4 font-semibold text-white"
          type="button"
          onClick={(event) => stopAndRun(event, primaryAction.action)}
        >
          <primaryAction.icon size={16} /> {primaryAction.label}
        </button>

        <div className={`grid gap-2 ${secondaryActions.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {secondaryActions.map((item) => (
            <button
              key={item.action}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-4 font-medium text-slate-700"
              type="button"
              onClick={(event) => stopAndRun(event, item.action)}
            >
              <item.icon size={16} /> {item.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}
