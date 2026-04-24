import { differenceInHours } from 'date-fns'
import { BOTH_ASSIGNEE_ID, TASK_STATUS } from './constants'
import { getTaskStatus, toDate } from './format'

function normalizeNow(now) {
  return now instanceof Date ? now : new Date(now)
}

function isCompletedTask(task) {
  return getTaskStatus(task) === TASK_STATUS.COMPLETED
}

function isSnoozedUntilFuture(task, now) {
  const snoozedUntil = toDate(task.snoozedUntil)
  return Boolean(snoozedUntil && snoozedUntil.getTime() > now.getTime())
}

function isOpenTask(task, now) {
  return !isCompletedTask(task) && !isSnoozedUntilFuture(task, now)
}

function isAssignedToCurrentUser(task, currentUserId) {
  return task.assignedTo === currentUserId || task.assignedTo === BOTH_ASSIGNEE_ID
}

function getWhyThisIsShowingLabel(task, currentUserId) {
  if (task.isOverdue) return 'Overdue'
  if (task.isDueSoon) return 'Due soon'
  if (isAssignedToCurrentUser(task, currentUserId)) return "You're assigned"
  if (task.effort === 'Quick') return 'Quick win'
  return ''
}

export function scoreTask(task, currentUserId) {
  let score = 0

  if (task.isOverdue) score += 100
  else if (task.isDueSoon) score += 60

  if (isAssignedToCurrentUser(task, currentUserId)) score += 25
  if (getTaskStatus(task) === TASK_STATUS.NOT_STARTED) score += 15
  if (task.whyThisMatters?.trim()) score += 20
  if (task.effort === 'Quick') score += 10
  if (task.startedAt || getTaskStatus(task) === TASK_STATUS.IN_PROGRESS) score += 30
  if ((task.ageHours ?? Number.POSITIVE_INFINITY) <= 24) score += 5

  return score
}

function enrichTask(task, currentUserId, now) {
  const dueDate = toDate(task.dueDate)
  const createdAt = toDate(task.createdAt)
  const dueMs = dueDate?.getTime() ?? null
  const nowMs = now.getTime()
  const ageHours = createdAt ? Math.max(0, differenceInHours(now, createdAt)) : 0
  const isOverdue = dueMs !== null && dueMs < nowMs
  const isDueSoon = dueMs !== null && dueMs >= nowMs && dueMs - nowMs <= 24 * 60 * 60 * 1000

  const enrichedTask = {
    ...task,
    isOverdue,
    isDueSoon,
    ageHours,
  }
  const _surfaceReason = getWhyThisIsShowingLabel(enrichedTask, currentUserId)

  return {
    ...enrichedTask,
    _score: scoreTask(enrichedTask, currentUserId),
    _surfaceReason,
  }
}

function compareByScore(a, b) {
  const scoreDelta = (b._score ?? 0) - (a._score ?? 0)
  if (scoreDelta !== 0) return scoreDelta

  const aDue = toDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY
  const bDue = toDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY
  if (aDue !== bDue) return aDue - bDue

  const aCreated = toDate(a.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY
  const bCreated = toDate(b.createdAt)?.getTime() ?? Number.POSITIVE_INFINITY
  if (aCreated !== bCreated) return aCreated - bCreated

  return String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

export function selectTaskViews({
  tasks,
  currentUserId,
  lowEnergyMode = false,
  now = Date.now(),
}) {
  const resolvedNow = normalizeNow(now)
  const openTasks = tasks.filter((task) => isOpenTask(task, resolvedNow))

  if (!openTasks.length) {
    return {
      focus: null,
      checkIn: [],
      dragging: [],
      upcoming: [],
      next: [],
      today: [],
      backlog: [],
      snoozed: [],
      allSorted: [],
      enrichedById: {},
      whyLabels: {},
    }
  }

  const lowEnergyPool = lowEnergyMode ? openTasks.filter((task) => task.effort === 'Quick') : openTasks
  const scoringPool = lowEnergyPool.length ? lowEnergyPool : openTasks
  const allSorted = scoringPool.map((task) => enrichTask(task, currentUserId, resolvedNow)).sort(compareByScore)

  const enrichedById = Object.fromEntries(allSorted.map((task) => [task.id, task]))
  const whyLabels = Object.fromEntries(allSorted.map((task) => [task.id, task._surfaceReason || '']))

  const focus =
    allSorted[0] ??
    openTasks.find((task) => isAssignedToCurrentUser(task, currentUserId)) ??
    openTasks[0] ??
    null

  const used = new Set()
  const takeUnique = (list, limit) => {
    const result = []
    for (const task of list) {
      if (!task?.id || used.has(task.id)) continue
      used.add(task.id)
      result.push(task)
      if (result.length === limit) break
    }
    return result
  }

  if (focus?.id) used.add(focus.id)
  const next = takeUnique(allSorted, 3)
  const checkIn = takeUnique(
    allSorted.filter((task) => task.isOverdue || (task.ageHours > 48 && getTaskStatus(task) === TASK_STATUS.NOT_STARTED)),
    3,
  )
  const upcoming = takeUnique(
    allSorted
      .filter((task) => {
        const dueDate = toDate(task.dueDate)
        if (!dueDate) return false
        const dueMs = dueDate.getTime()
        const nowMs = resolvedNow.getTime()
        return dueMs >= nowMs && dueMs - nowMs <= 7 * 24 * 60 * 60 * 1000
      })
      .sort((a, b) => (toDate(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY) - (toDate(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY)),
    4,
  )

  const today = allSorted.filter((task) => task.isOverdue || task.isDueSoon || (!toDate(task.dueDate) && task.urgency === 'Today'))
  const upcomingBucket = allSorted.filter((task) => !today.some((candidate) => candidate.id === task.id) && (() => {
    const dueDate = toDate(task.dueDate)
    if (!dueDate) return false
    const diffHours = (dueDate.getTime() - resolvedNow.getTime()) / (1000 * 60 * 60)
    return diffHours >= 0 && diffHours <= 7 * 24
  })())
  const backlog = allSorted.filter((task) => !today.some((candidate) => candidate.id === task.id) && !upcomingBucket.some((candidate) => candidate.id === task.id))
  const snoozed = tasks.filter((task) => !isCompletedTask(task) && isSnoozedUntilFuture(task, resolvedNow))

  return {
    focus,
    checkIn,
    dragging: checkIn,
    upcoming,
    next,
    today,
    backlog,
    snoozed,
    allSorted,
    enrichedById,
    whyLabels,
  }
}

export function selectTasks(options) {
  return selectTaskViews(options)
}
