import {
  addDays,
  addHours,
  differenceInHours,
  differenceInMinutes,
  differenceInCalendarDays,
  endOfDay,
  format,
  formatDistanceToNow,
  isAfter,
  isBefore,
  isSaturday,
  isToday,
  isTomorrow,
  parse,
  parseISO,
  set,
  startOfDay,
} from 'date-fns'
import { TASK_STATUS, TASK_STATUS_LABELS } from './constants'

export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  return parseISO(value)
}

export function getTaskStatus(task) {
  const snoozedUntil = toDate(task.snoozedUntil)
  if ((task.status === TASK_STATUS.COMPLETED || task.isCompleted) && task.completedAt) return TASK_STATUS.COMPLETED
  if (task.status === TASK_STATUS.IN_PROGRESS) return TASK_STATUS.IN_PROGRESS
  if ((task.status === TASK_STATUS.SNOOZED || snoozedUntil) && snoozedUntil && isAfter(snoozedUntil, new Date())) return TASK_STATUS.SNOOZED
  return TASK_STATUS.NOT_STARTED
}

export function isTaskActive(task) {
  return getTaskStatus(task) !== TASK_STATUS.COMPLETED
}

export function isSnoozed(task) {
  return getTaskStatus(task) === TASK_STATUS.SNOOZED
}

export function generateTimeOptions() {
  return Array.from({ length: 96 }, (_, index) => {
    const hours = Math.floor(index / 4)
    const minutes = (index % 4) * 15
    const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    return {
      value,
      label: format(parse(value, 'HH:mm', new Date()), 'h:mm a'),
    }
  })
}

export function normalizeTimeValue(value) {
  if (!value) return ''
  if (/^\d{2}:\d{2}$/.test(value)) return value

  const parsed = parse(value.trim(), 'h:mm a', new Date())
  if (!Number.isNaN(parsed.getTime())) {
    return format(parsed, 'HH:mm')
  }

  return value
}

export function formatTime12h(value) {
  const normalized = normalizeTimeValue(value)
  if (!normalized || !/^\d{2}:\d{2}$/.test(normalized)) return value || ''
  const parsed = parse(normalized, 'HH:mm', new Date())
  return Number.isNaN(parsed.getTime()) ? value || '' : format(parsed, 'h:mm a')
}

export function formatDueContext(task) {
  const dueDate = toDate(task.dueDate)
  const formattedTime = formatTime12h(task.dueTime)
  if (!dueDate) return 'No due date'
  if (isToday(dueDate)) return formattedTime ? `Today at ${formattedTime}` : 'Today'
  if (isTomorrow(dueDate)) return formattedTime ? `Tomorrow at ${formattedTime}` : 'Tomorrow'

  const daysAway = differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date()))
  const prefix = daysAway < 0 ? 'Was due' : 'Due'
  return `${prefix} ${format(dueDate, 'EEE, MMM d')}${formattedTime ? ` at ${formattedTime}` : ''}`
}

export function formatTaskAge(task) {
  const createdAt = toDate(task.createdAt)
  if (!createdAt) return null
  if (isToday(createdAt)) return 'Added today'
  const days = differenceInCalendarDays(startOfDay(new Date()), startOfDay(createdAt))
  if (days === 1) return 'Added yesterday'
  if (days <= 3) return `Added ${days} days ago`
  return `Sitting for ${days} days`
}

export function describeRepeat(task) {
  if (!task.repeatType || task.repeatType === 'none') return null
  if (task.repeatType === 'specific-days' && task.repeatDays?.length) {
    return `Repeats ${task.repeatDays.join('/')}`
  }
  const label = task.repeatType.charAt(0).toUpperCase() + task.repeatType.slice(1)
  return `Repeats ${label}`
}

export function nextRepeatLabel(task) {
  if (!task.nextOccurrenceAt) return null
  const nextDate = toDate(task.nextOccurrenceAt)
  if (!nextDate) return null
  return `Next: ${format(nextDate, 'MMM d')}`
}

export function formatLastHandled(task) {
  const completedAt = toDate(task.completedAt)
  if (!completedAt) return null
  return `Handled ${formatDistanceToNow(completedAt, { addSuffix: true })}`
}

export function formatHandledIn(task) {
  const completedAt = toDate(task.completedAt)
  const createdAt = toDate(task.createdAt)
  if (!completedAt || !createdAt) return null
  const days = Math.max(0, differenceInCalendarDays(completedAt, createdAt))
  return `Handled in ${days} day${days === 1 ? '' : 's'}`
}

export function formatStartedAgo(task) {
  const startedAt = toDate(task.startedAt)
  if (!startedAt || getTaskStatus(task) !== TASK_STATUS.IN_PROGRESS) return null
  const minutes = Math.max(1, differenceInMinutes(new Date(), startedAt))
  return `In progress · ${minutes} min`
}

export function formatStatusLabel(task) {
  const status = getTaskStatus(task)
  return TASK_STATUS_LABELS[status] ?? TASK_STATUS_LABELS[TASK_STATUS.NOT_STARTED]
}

export function resolveSnoozeUntil(optionId, customDate) {
  const now = new Date()
  if (optionId === '1-hour') return addHours(now, 1)
  if (optionId === '3-hours') return addHours(now, 3)
  if (optionId === '2-hours') return addHours(now, 2)
  if (optionId === 'tonight') return endOfDay(now)
  if (optionId === 'tomorrow-morning') return set(addDays(now, 1), { hours: 8, minutes: 0, seconds: 0, milliseconds: 0 })
  if (optionId === 'weekend') {
    let cursor = addDays(now, 1)
    while (!isSaturday(cursor)) cursor = addDays(cursor, 1)
    return set(cursor, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 })
  }
  if (optionId === 'custom' && customDate) return set(new Date(customDate + 'T12:00:00'), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 })
  return null
}

export function resolveRescheduleDate(optionId, customDate) {
  const now = new Date()
  if (optionId === 'tomorrow') return addDays(now, 1)
  if (optionId === 'weekend') {
    let cursor = addDays(now, 1)
    while (!isSaturday(cursor)) cursor = addDays(cursor, 1)
    return cursor
  }
  if (optionId === 'next-week') return addDays(now, 7)
  if (optionId === 'custom' && customDate) return new Date(customDate + 'T12:00:00')
  return null
}

export function isOverdue(task) {
  const dueDate = toDate(task.dueDate)
  return dueDate ? isBefore(startOfDay(dueDate), startOfDay(new Date())) && getTaskStatus(task) !== TASK_STATUS.COMPLETED : false
}

export function isDueSoon(task) {
  const dueDate = toDate(task.dueDate)
  return dueDate ? isAfter(dueDate, new Date()) && differenceInCalendarDays(dueDate, new Date()) <= 2 : false
}

export function isDueWithinHours(task, minHours = 0, maxHours = 4) {
  const dueDate = toDate(task.dueDate)
  if (!dueDate) return false
  const hours = differenceInHours(dueDate, new Date())
  return hours >= minHours && hours <= maxHours
}
