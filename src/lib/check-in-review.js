import { differenceInCalendarDays } from 'date-fns'
import { BOTH_ASSIGNEE_ID, TASK_STATUS } from './constants'
import { getTaskStatus, isOverdue, toDate } from './format'

function daysSince(value, now = new Date()) {
  const date = toDate(value)
  if (!date) return null
  return Math.max(0, differenceInCalendarDays(now, date))
}

function isOpenTask(task) {
  return getTaskStatus(task) !== TASK_STATUS.COMPLETED
}

function isAssignedToUser(task, userId) {
  return task.assignedTo === userId || task.assignedTo === BOTH_ASSIGNEE_ID
}

function isPartnerRequested(task, currentUserId) {
  return Boolean(task.requestedBy && task.requestedBy !== currentUserId)
}

function hasMoved(task) {
  return Boolean(task.startedAt || task.inProgress || task.acknowledgedAt || task.completedAt)
}

function taskAgeDays(task, now = new Date()) {
  return daysSince(task.createdAt ?? task.dueDate, now) ?? 0
}

function lastActionDays(task, now = new Date()) {
  return daysSince(task.lastActionAt ?? task.updatedAt ?? task.createdAt, now) ?? taskAgeDays(task, now)
}

function uniqueById(tasks) {
  const seen = new Set()
  return tasks.filter((task) => {
    if (!task?.id || seen.has(task.id)) return false
    seen.add(task.id)
    return true
  })
}

function sortByAgeDesc(tasks, now = new Date()) {
  return [...tasks].sort((a, b) => taskAgeDays(b, now) - taskAgeDays(a, now))
}

export function buildWeeklyCheckInReview({ tasks = [], currentUserId, partnerId, now = new Date() } = {}) {
  if (!currentUserId) {
    return {
      completed: [],
      didNotMove: [],
      partnerCarrying: [],
      needsDecision: [],
      agenda: [],
    }
  }

  const openTasks = tasks.filter(isOpenTask)
  const completedThisWeek = tasks
    .filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
    .filter((task) => {
      const completedDays = daysSince(task.completedAt, now)
      return completedDays !== null && completedDays <= 7
    })
    .slice(0, 5)

  const didNotMove = sortByAgeDesc(
    openTasks.filter((task) => {
      if (!isAssignedToUser(task, currentUserId)) return false
      if (hasMoved(task)) return false
      if (taskAgeDays(task, now) < 3) return false
      return true
    }),
    now,
  ).slice(0, 5)

  const partnerCarrying = sortByAgeDesc(
    openTasks.filter((task) => {
      if (!isAssignedToUser(task, currentUserId)) return false
      if (!isPartnerRequested(task, currentUserId)) return false
      if (hasMoved(task)) return false
      return taskAgeDays(task, now) >= 2
    }),
    now,
  ).slice(0, 5)

  const needsDecision = sortByAgeDesc(
    openTasks.filter((task) => {
      const snoozeCount = task.snoozeCount ?? 0
      const staleDays = lastActionDays(task, now)
      return isOverdue(task) || snoozeCount >= 2 || staleDays >= 7
    }),
    now,
  ).slice(0, 5)

  const agenda = uniqueById([
    ...partnerCarrying,
    ...needsDecision,
    ...didNotMove,
  ]).slice(0, 6).map((task) => {
    const age = taskAgeDays(task, now)
    const requestedByPartner = isPartnerRequested(task, currentUserId)
    const snoozeCount = task.snoozeCount ?? 0

    let reason = 'This needs a clear next step.'
    if (requestedByPartner && !hasMoved(task)) reason = 'Your partner asked for this and it has not moved yet.'
    else if (snoozeCount >= 2) reason = 'This has been pushed more than once.'
    else if (isOverdue(task)) reason = 'This is past due and still open.'
    else if (age >= 7) reason = 'This has been sitting for a while.'

    return {
      id: task.id,
      title: task.title,
      assignedTo: task.assignedTo,
      requestedBy: task.requestedBy,
      category: task.category,
      ageDays: age,
      reason,
      suggestedQuestion: requestedByPartner
        ? 'What would make this easier to move this week?'
        : 'Is this still needed, or should we change the commitment?',
    }
  })

  return {
    completed: completedThisWeek,
    didNotMove,
    partnerCarrying,
    needsDecision,
    agenda,
    summary: {
      completedCount: completedThisWeek.length,
      didNotMoveCount: didNotMove.length,
      partnerCarryingCount: partnerCarrying.length,
      needsDecisionCount: needsDecision.length,
      agendaCount: agenda.length,
      partnerId: partnerId ?? null,
    },
  }
}

export function getWeeklyCheckInOpening(review = {}) {
  const summary = review.summary ?? {}

  if (summary.partnerCarryingCount > 0) {
    return 'A few things your partner asked for need a clear next step.'
  }

  if (summary.needsDecisionCount > 0) {
    return 'Some open commitments need a decision, not another reminder.'
  }

  if (summary.didNotMoveCount > 0) {
    return 'A few tasks have not moved yet. Pick what still matters.'
  }

  if (summary.completedCount > 0) {
    return 'You have movement from this week. Use the check-in to stay aligned.'
  }

  return 'Use this check-in to decide what matters this week.'
}
