import {
  differenceInCalendarDays,
  differenceInHours,
  endOfWeek,
  format,
  startOfWeek,
} from 'date-fns'
import {
  BOTH_ASSIGNEE_ID,
  CATEGORY_KEYWORDS,
  CLARITY_SUGGESTIONS,
  DEFAULT_WEEKLY_GOAL,
  EFFORT_KEYWORDS,
  POINTS_BY_EFFORT,
  REPEAT_SUGGESTIONS,
  TASK_STATUS,
} from './constants'
import { getTaskStatus, isOverdue, isSnoozed, toDate } from './format'
import { createBreakdownTask, deriveDoThisNextSignals, getDoThisNextMessage, getDraggingTasks, getPriorityScore, getQuickWins, getRepeatCandidates, getScoredOpenTasks, getTaskHealth, getUpcomingTasks, selectDoThisNextTask } from './task-decision'
import { selectTasks } from './selection'
import { computeNextRepeatDate } from './task-state'

export function inferClarity(title, existingClarity) {
  if (existingClarity?.trim()) return existingClarity
  const lower = title.toLowerCase()
  const match = CLARITY_SUGGESTIONS.find((item) => lower.includes(item.match))
  return match?.suggestion ?? ''
}

export function inferRepeatType(title, existingRepeatType = 'none') {
  if (existingRepeatType !== 'none') return existingRepeatType
  const lower = title.toLowerCase()
  const match = REPEAT_SUGGESTIONS.find((item) => lower.includes(item.match))
  return match?.repeatType ?? existingRepeatType
}

export function inferCategory(title, existingCategory) {
  if (existingCategory && existingCategory !== 'Home') return existingCategory
  const lower = title.toLowerCase()
  const match = CATEGORY_KEYWORDS.find((entry) => entry.match.some((keyword) => lower.includes(keyword)))
  return match?.category ?? existingCategory
}

export function inferEffort(title, existingEffort) {
  if (existingEffort && existingEffort !== 'Quick') return existingEffort
  const lower = title.toLowerCase()
  const match = EFFORT_KEYWORDS.find((entry) => entry.match.some((keyword) => lower.includes(keyword)))
  return match?.effort ?? existingEffort
}

export function scoreTask(task, currentUserId, lowEnergyMode) {
  return getPriorityScore(task, currentUserId, { lowEnergyMode })
}

export function sortTasks(tasks, currentUserId, lowEnergyMode) {
  return selectTasks({
    tasks,
    currentUserId,
    lowEnergyMode,
    now: Date.now(),
  }).allSorted
}

export function shouldShowExpectationCheck(task) {
  const createdAt = toDate(task.createdAt)
  const snoozedUntil = toDate(task.snoozedUntil)
  const snoozeCount = task.snoozeCount ?? 0
  if (snoozeCount >= 3) return true
  if (!createdAt) return false
  const age = differenceInCalendarDays(new Date(), createdAt)
  if (age >= 5) return true
  if (snoozedUntil && differenceInCalendarDays(new Date(), snoozedUntil) >= 3) return true
  return false
}

export function getPointsForTask(task) {
  return POINTS_BY_EFFORT[task.effort] ?? 1
}

export function buildRepeatPreview(task) {
  return computeNextRepeatDate(task)
}

export function createTaskPayload(form, currentUser) {
  const now = new Date().toISOString()
  const dueDate = form.dueDate ? new Date(form.dueDate + 'T12:00:00').toISOString() : new Date().toISOString()
  return {
    clientRequestId: crypto.randomUUID(),
    title: form.title.trim(),
    notes: form.notes.trim(),
    assignedTo: form.assignedTo || currentUser.id,
    requestedBy: currentUser.id,
    dueDate,
    dueTime: form.dueTime || '',
    urgency: form.urgency,
    effort: form.effort,
    category: form.category,
    clarity: form.clarity.trim(),
    whyThisMatters: form.whyThisMatters.trim(),
    repeatType: form.repeatType,
    repeatDays: form.repeatType === 'specific-days' ? form.repeatDays : [],
    status: TASK_STATUS.NOT_STARTED,
    createdAt: now,
    completedAt: null,
    snoozedUntil: null,
    isCompleted: false,
    isMissed: false,
    acknowledgedAt: null,
    lastActionAt: now,
    snoozeCount: 0,
    repeatPausedAt: null,
    nextOccurrenceAt: buildRepeatPreview(form)?.toISOString() ?? null,
    startedAt: null,
    inProgress: false,
    history: [{ type: 'created', at: now, by: currentUser.id }],
    reopenedFromTaskId: null,
    trackedMinutes: 0,
  }
}

export function deriveSections(tasks, currentUserId, lowEnergyMode, goals, selection = null) {
  const active = tasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED && !task.isMissed)
  const completed = tasks.filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
  const missed = tasks.filter((task) => task.isMissed)
  const now = new Date()

  const normalizedSelection = selection ?? selectTasks({
    tasks: active,
    currentUserId,
    lowEnergyMode,
    now,
  })
  const sorted = normalizedSelection.allSorted?.length
    ? normalizedSelection.allSorted
    : getScoredOpenTasks(active, currentUserId, { now, lowEnergy: lowEnergyMode })
  const unsnoozed = sorted.filter((task) => !isSnoozed(task))
  const visibleActive = lowEnergyMode ? unsnoozed.filter((task) => task.effort !== 'Heavy') : unsnoozed
  const recentlyHandled = completed
    .slice()
    .sort((a, b) => (toDate(b.completedAt)?.getTime() ?? 0) - (toDate(a.completedAt)?.getTime() ?? 0))
    .slice(0, 4)
  const goalSignals = deriveDoThisNextSignals(tasks, goals)
  const doThisNext = normalizedSelection.focus ?? selectDoThisNextTask(tasks, currentUserId, { lowEnergyMode, goals, goalSignals })
  const focusTask = doThisNext ? createBreakdownTask(doThisNext) ?? doThisNext : null
  const renderedTaskIds = new Set()
  if (doThisNext?.id) renderedTaskIds.add(doThisNext.id)
  if (focusTask?.parentTaskId) renderedTaskIds.add(focusTask.parentTaskId)
  if (focusTask?.id && !String(focusTask.id).startsWith('breakdown:')) renderedTaskIds.add(focusTask.id)

  const draggingTasks = (normalizedSelection.checkIn ?? normalizedSelection.dragging ?? getDraggingTasks(tasks, currentUserId, { lowEnergyMode, now, excludeIds: renderedTaskIds }))
    .filter((task) => !renderedTaskIds.has(task.id))
  draggingTasks.forEach((task) => renderedTaskIds.add(task.id))
  const upcomingTasks = (normalizedSelection.upcoming ?? getUpcomingTasks(tasks, currentUserId, { now, excludeIds: renderedTaskIds }))
    .filter((task) => !renderedTaskIds.has(task.id))
  upcomingTasks.forEach((task) => renderedTaskIds.add(task.id))
  const repeatSuggestions = getRepeatCandidates(tasks)
  const quickWinTasks = getQuickWins(tasks, currentUserId, { lowEnergyMode, now, excludeIds: renderedTaskIds })
  quickWinTasks.forEach((task) => renderedTaskIds.add(task.id))
  const openTasks = visibleActive.filter((task) => !renderedTaskIds.has(task.id)).slice(0, 12)

  return {
    topTask: doThisNext,
    focusTask,
    topTaskMessage: doThisNext ? getDoThisNextMessage(doThisNext, tasks, currentUserId, { lowEnergyMode, goals, goalSignals }) : '',
    needsAttention: visibleActive.filter((task) => isOverdue(task) || shouldShowExpectationCheck(task) || getTaskHealth(task) === 'broken').slice(0, 6),
    openTasks,
    futureTasks: visibleActive.filter((task) => {
      const dueDate = toDate(task.dueDate)
      return dueDate ? differenceInCalendarDays(dueDate, now) > 14 : false
    }),
    snoozedTasks: active.filter((task) => isSnoozed(task)),
    dueSoonTasks: upcomingTasks,
    recentlyHandled,
    missed,
    completed: completed
      .slice()
      .sort((a, b) => (toDate(b.completedAt)?.getTime() ?? 0) - (toDate(a.completedAt)?.getTime() ?? 0))
      .slice(0, 12),
    draggingTasks: draggingTasks.slice(0, 6),
    repeatSuggestions: repeatSuggestions.slice(0, 4),
    quickWinTasks,
    renderedTaskIds,
  }
}

export function computeStats(tasks) {
  const completed = tasks.filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
  const missed = tasks.filter((task) => task.isMissed)
  const open = tasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED && !task.isMissed)
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const thisWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const completedThisWeek = completed.filter((task) => {
    const completedAt = toDate(task.completedAt)
    return completedAt && completedAt >= thisWeekStart && completedAt <= thisWeekEnd
  })
  const completedToday = completed.filter((task) => {
    const completedAt = toDate(task.completedAt)
    return completedAt && format(completedAt, 'yyyy-MM-dd') === todayKey
  })

  const daysWithCompletion = new Set(
    completedThisWeek
      .map((task) => toDate(task.completedAt))
      .filter(Boolean)
      .map((date) => format(date, 'yyyy-MM-dd')),
  )

  const completionHours = completed
    .map((task) => {
      const createdAt = toDate(task.createdAt)
      const completedAt = toDate(task.completedAt)
      if (!createdAt || !completedAt) return null
      return Math.max(0, differenceInHours(completedAt, createdAt))
    })
    .filter((value) => value !== null)

  const avgCompletionHours = completionHours.length
    ? Math.round(completionHours.reduce((sum, value) => sum + value, 0) / completionHours.length)
    : 0

  const reliability = completed.length + missed.length
    ? Math.round((completed.length / (completed.length + missed.length)) * 100)
    : 100
  const onTimeCount = completed.filter((task) => {
    const completedAt = toDate(task.completedAt)
    const dueDate = toDate(task.dueDate)
    if (!completedAt || !dueDate) return true
    return completedAt <= dueDate
  }).length
  const lateCount = Math.max(0, completed.length - onTimeCount)

  return {
    totalCompleted: completed.length,
    weeklyHandled: completedThisWeek.length,
    weeklyGoal: DEFAULT_WEEKLY_GOAL,
    todayHandled: completedToday.length,
    daysWithCompletion: daysWithCompletion.size,
    taskStreak: completed.length,
    avgCompletionHours,
    reliability,
    openCount: open.length,
    missedCount: missed.length,
    onTimeCount,
    lateCount,
  }
}

export function getBannerMessage(topTask, stats) {
  if (!topTask) {
    return {
      title: 'Morning check-in',
      body: `You cleared ${stats.weeklyHandled} tasks this week. Keep it light today.`,
    }
  }
  return {
    title: `Start with ${topTask.title}`,
    body: `You've got ${stats.openCount} open. Start with one.`,
  }
}

export function appendHistory(task, type, by, meta = {}) {
  return [...(task.history ?? []), { type, at: new Date().toISOString(), by, ...meta }]
}
