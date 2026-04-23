import { addMonths, addWeeks, differenceInMinutes, format } from 'date-fns'
import { TASK_STATUS } from './constants'
import { getTaskStatus, toDate } from './format'

function withMeta(task, updates, actorId, historyType, meta = {}) {
  return {
    ...task,
    ...updates,
    lastActionAt: meta.lastActionAt ?? new Date().toISOString(),
    history: [...(task.history ?? []), { type: historyType, by: actorId, at: new Date().toISOString(), ...meta }],
  }
}

export function startTask(task, actorId, now = new Date().toISOString()) {
  if (getTaskStatus(task) === TASK_STATUS.COMPLETED) {
    throw new Error('Completed tasks cannot be started without reopening.')
  }
  if (getTaskStatus(task) === TASK_STATUS.IN_PROGRESS) return task

  return withMeta(
    task,
    {
      status: TASK_STATUS.IN_PROGRESS,
      startedAt: now,
      inProgress: true,
      snoozedUntil: null,
    },
    actorId,
    'started',
    { lastActionAt: now },
  )
}

export function stopTask(task, actorId, now = new Date().toISOString()) {
  if (getTaskStatus(task) !== TASK_STATUS.IN_PROGRESS) return task
  const startedAt = toDate(task.startedAt)
  const elapsedMinutes = startedAt ? Math.max(0, differenceInMinutes(new Date(now), startedAt)) : 0

  return withMeta(
    task,
    {
      status: TASK_STATUS.NOT_STARTED,
      startedAt: null,
      inProgress: false,
      trackedMinutes: (task.trackedMinutes ?? 0) + elapsedMinutes,
    },
    actorId,
    'stopped',
    { elapsedMinutes, lastActionAt: now },
  )
}

export function completeTask(task, actorId, now = new Date().toISOString()) {
  if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return task
  if (getTaskStatus(task) === TASK_STATUS.SNOOZED) {
    throw new Error('Snoozed tasks must be unsnoozed before completion.')
  }

  return withMeta(
    task,
    {
      status: TASK_STATUS.COMPLETED,
      completedAt: now,
      isCompleted: true,
      startedAt: null,
      inProgress: false,
      snoozedUntil: null,
    },
    actorId,
    'completed',
    { lastActionAt: now },
  )
}

export function reopenTask(task, actorId, now = new Date().toISOString()) {
  return withMeta(
    task,
    {
      status: TASK_STATUS.NOT_STARTED,
      completedAt: null,
      isCompleted: false,
      startedAt: null,
      inProgress: false,
      snoozedUntil: null,
      isMissed: false,
    },
    actorId,
    'reopened',
    { lastActionAt: now },
  )
}

export function snoozeTask(task, snoozedUntil, actorId, now = new Date().toISOString()) {
  return withMeta(
    task,
    {
      status: TASK_STATUS.SNOOZED,
      snoozedUntil,
      startedAt: null,
      inProgress: false,
      snoozeCount: (task.snoozeCount ?? 0) + 1,
    },
    actorId,
    'snoozed',
    { snoozedUntil, lastActionAt: now },
  )
}

export function maybeUnsnoozeTask(task, now = new Date().toISOString()) {
  const snoozedUntil = toDate(task.snoozedUntil)
  if (getTaskStatus(task) !== TASK_STATUS.SNOOZED || !snoozedUntil) return task
  if (snoozedUntil > new Date(now)) return task

  return {
    ...task,
    status: TASK_STATUS.NOT_STARTED,
    snoozedUntil: null,
    inProgress: false,
  }
}

export function rescheduleTask(task, dueDate, actorId, now = new Date().toISOString()) {
  return withMeta(
    task,
    {
      dueDate,
      snoozedUntil: null,
      status: getTaskStatus(task) === TASK_STATUS.COMPLETED ? TASK_STATUS.COMPLETED : TASK_STATUS.NOT_STARTED,
    },
    actorId,
    'rescheduled',
    { dueDate, lastActionAt: now },
  )
}

export function acknowledgeTask(task, actorId, now = new Date().toISOString()) {
  return withMeta(
    task,
    {
      acknowledgedAt: now,
    },
    actorId,
    'acknowledged',
    { lastActionAt: now },
  )
}

export function computeNextRepeatDate(task) {
  const dueDate = toDate(task.dueDate)
  if (!dueDate) return null

  switch (task.repeatType) {
    case 'weekly':
      return addWeeks(dueDate, 1)
    case 'biweekly':
      return addWeeks(dueDate, 2)
    case 'monthly':
      return addMonths(dueDate, 1)
    case 'specific-days': {
      const days = task.repeatDays ?? []
      for (let offset = 1; offset <= 7; offset += 1) {
        const candidate = addWeeks(dueDate, 0)
        candidate.setDate(candidate.getDate() + offset)
        if (days.includes(format(candidate, 'EEE'))) return candidate
      }
      return null
    }
    default:
      return null
  }
}

export function shouldAdvanceRepeat(task) {
  return Boolean(task.repeatType && task.repeatType !== 'none' && !task.repeatPausedAt)
}

export function advanceRepeatingTask(task, actorId, now = new Date().toISOString(), historyType = 'completed') {
  if (!shouldAdvanceRepeat(task)) return null
  const repeatDate = computeNextRepeatDate(task)
  if (!repeatDate) return null

  return withMeta(
    task,
    {
      dueDate: repeatDate.toISOString(),
      nextOccurrenceAt: repeatDate.toISOString(),
      status: TASK_STATUS.SNOOZED,
      snoozedUntil: repeatDate.toISOString(),
      completedAt: historyType === 'completed' ? now : task.completedAt ?? null,
      isCompleted: false,
      startedAt: null,
      inProgress: false,
      isMissed: false,
    },
    actorId,
    historyType === 'skipped' ? 'repeat-skipped' : 'repeat-advanced',
    { nextDueDate: repeatDate.toISOString(), lastActionAt: now },
  )
}
