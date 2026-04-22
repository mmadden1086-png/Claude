import {
  isBefore,
  isAfter,
  isToday,
  isThisWeek,
  parseISO,
  startOfDay,
  differenceInDays,
  differenceInMilliseconds,
} from 'date-fns'

// ─── Date helpers ────────────────────────────────────────────────────────────

export const parseDue = (dueDate) => {
  if (!dueDate) return null
  try {
    return typeof dueDate === 'string' ? parseISO(dueDate) : new Date(dueDate)
  } catch {
    return null
  }
}

const now = () => new Date()

// ─── Task state predicates ───────────────────────────────────────────────────

export const isActivelySnoozed = (task) => {
  if (!task.snoozedUntil) return false
  return isAfter(task.snoozedUntil, now())
}

export const isOverdue = (task) => {
  if (task.isCompleted || isActivelySnoozed(task)) return false
  const due = parseDue(task.dueDate)
  if (!due) return false
  return isBefore(due, startOfDay(now()))
}

export const isDueToday = (task) => {
  const due = parseDue(task.dueDate)
  if (!due) return false
  return isToday(due)
}

export const isDueSoon = (task) => {
  const due = parseDue(task.dueDate)
  if (!due) return false
  const ms = differenceInMilliseconds(due, now())
  return ms > 0 && ms < 24 * 60 * 60 * 1000
}

export const isDueThisWeek = (task) => {
  const due = parseDue(task.dueDate)
  if (!due) return false
  return isThisWeek(due, { weekStartsOn: 0 }) && !isToday(due) && !isOverdue({ ...task })
}

export const isFutureTask = (task) => {
  const due = parseDue(task.dueDate)
  if (!due) return false
  return isAfter(due, startOfDay(now())) && !isToday(due)
}

// ─── Priority scoring ────────────────────────────────────────────────────────
// Lower = higher priority

const URGENCY_WEIGHT = { high: 0, medium: 1, low: 2 }
const EFFORT_WEIGHT = { Quick: 0, Medium: 1, Heavy: 2 }

const getPriorityScore = (task, uid) => {
  let score = 0

  // Not assigned to me adds a big penalty
  if (task.assignedTo !== uid) score += 200

  // Due urgency
  if (isOverdue(task)) score += 0
  else if (isDueToday(task)) score += 20
  else if (isDueSoon(task)) score += 15
  else if (isDueThisWeek(task)) score += 40
  else if (task.dueDate) score += 60
  else score += 80

  // Urgency tiebreaker
  score += (URGENCY_WEIGHT[task.urgency] ?? 1) * 2

  return score
}

export const sortByPriority = (tasks, uid) =>
  [...tasks].sort((a, b) => getPriorityScore(a, uid) - getPriorityScore(b, uid))

// ─── Task grouping helpers ────────────────────────────────────────────────────

export const getActiveTasks = (tasks) =>
  tasks.filter((t) => !t.isCompleted && !isActivelySnoozed(t))

export const getSnoozedTasks = (tasks) =>
  tasks.filter((t) => !t.isCompleted && isActivelySnoozed(t))

export const getCompletedTasks = (tasks) => tasks.filter((t) => t.isCompleted)

export const getOverdueTasks = (tasks) =>
  tasks.filter((t) => !t.isCompleted && !isActivelySnoozed(t) && isOverdue(t))

export const getNeedsAttentionTasks = (tasks) => {
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000
  return tasks.filter((t) => {
    if (t.isCompleted || isActivelySnoozed(t)) return false
    const old =
      t.createdAt instanceof Date &&
      differenceInMilliseconds(now(), t.createdAt) > fiveDaysMs
    return isOverdue(t) || old
  })
}

export const getThisWeekTasks = (tasks) =>
  tasks.filter(
    (t) => !t.isCompleted && !isActivelySnoozed(t) && (isToday(parseDue(t.dueDate) || 0) || isDueThisWeek(t))
  )

export const getFutureTasks = (tasks) =>
  tasks.filter(
    (t) =>
      !t.isCompleted &&
      !isActivelySnoozed(t) &&
      !isOverdue(t) &&
      !isDueToday(t) &&
      !isDueThisWeek(t) &&
      t.dueDate
  )

export const getUndatedTasks = (tasks) =>
  tasks.filter((t) => !t.isCompleted && !isActivelySnoozed(t) && !t.dueDate)

// ─── Display helpers ──────────────────────────────────────────────────────────

export const formatDueContext = (task) => {
  const due = parseDue(task.dueDate)
  if (!due) return null

  if (isOverdue(task)) {
    const days = differenceInDays(startOfDay(now()), due)
    if (days === 0) return 'Due today'
    return `${days} day${days !== 1 ? 's' : ''} overdue`
  }
  if (isToday(due)) return 'Due today'

  const diff = differenceInDays(due, startOfDay(now()))
  if (diff === 1) return 'Due tomorrow'
  if (isThisWeek(due, { weekStartsOn: 0 })) {
    return `Due ${due.toLocaleDateString('en-US', { weekday: 'long' })}`
  }
  return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export const getAgingLabel = (task) => {
  if (!task.createdAt || !(task.createdAt instanceof Date)) return null
  const days = differenceInDays(now(), task.createdAt)
  if (days === 0) return 'Added today'
  if (days === 1) return 'Added yesterday'
  if (days <= 4) return `Added ${days} days ago`
  return `Sitting for ${days} days`
}
