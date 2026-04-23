import { addDays, differenceInCalendarDays, differenceInHours, endOfWeek, format, isSaturday, isSunday, isToday, startOfWeek, subDays } from 'date-fns'
import { BOTH_ASSIGNEE_ID, DEFAULT_USER_GOALS, TASK_STATUS } from './constants'
import { getTaskStatus, isDueWithinHours, isOverdue, isSnoozed, toDate } from './format'

const EFFORT_WEIGHT = {
  Quick: 0,
  Medium: 1,
  Heavy: 2,
}

const DUPLICATE_SUFFIXES = new Set(['started', 'again', 'today', 'now'])
const VAGUE_TOKENS = new Set(['stuff', 'things', 'misc', 'thing', 'items'])
const PRIORITY_THRESHOLD = 40
const FRICTION_BLOCK_THRESHOLD = 60

function tokenizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !DUPLICATE_SUFFIXES.has(token))
}

export function normalizeDuplicateTitle(title = '') {
  return tokenizeTitle(title).join(' ')
}

export function titleSimilarity(a = '', b = '') {
  const aTokens = new Set(tokenizeTitle(a))
  const bTokens = new Set(tokenizeTitle(b))
  if (!aTokens.size || !bTokens.size) return 0

  let overlap = 0
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1
  })

  return overlap / Math.max(aTokens.size, bTokens.size)
}

function titleTokens(task) {
  return tokenizeTitle(task.title)
}

function hasClearOutcome(task) {
  if (task.clarity?.trim()) return true
  const tokens = titleTokens(task)
  return tokens.length >= 2 && !tokens.some((token) => VAGUE_TOKENS.has(token))
}

function hasWeakClarity(task) {
  const clarity = task.clarity?.trim().toLowerCase() ?? ''
  if (!clarity) return true
  if (clarity === 'task completed and confirmed') return true
  return clarity.length < 18
}

function taskAgeDays(task) {
  const createdAt = toDate(task.createdAt)
  if (!createdAt) return 0
  return Math.max(0, differenceInCalendarDays(new Date(), createdAt))
}

function missedCount(task) {
  const historyMisses = (task.history ?? []).filter((item) => item.type === 'removed').length
  return historyMisses + (task.isMissed ? 1 : 0)
}

function hasNoProgress(task) {
  const status = getTaskStatus(task)
  return status !== TASK_STATUS.IN_PROGRESS && !task.startedAt && (task.trackedMinutes ?? 0) === 0 && !task.acknowledgedAt
}

function hasRecentNotification(task, cooldownHours = 6) {
  const notifiedAt = toDate(task.lastNotifiedAt)
  if (!notifiedAt) return false
  return differenceInHours(new Date(), notifiedAt) < cooldownHours
}

export function getTaskFriction(task) {
  let friction = 0
  if (!task.title?.trim()) friction += 40
  if (!hasClearOutcome(task)) friction += 45
  if (titleTokens(task).some((token) => VAGUE_TOKENS.has(token))) friction += 20
  if (!toDate(task.dueDate)) friction += 25
  if (!task.assignedTo) friction += 20
  if ((task.snoozeCount ?? 0) >= 2) friction += 30
  if (taskAgeDays(task) >= 3) friction += 20
  if (task.effort === 'Heavy') friction += 15
  return Math.min(100, friction)
}

export function shouldBreakDownTask(task) {
  if (!task) return false
  if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return false
  if ((task.snoozeCount ?? 0) >= 3) return true
  if (missedCount(task) > 0) return true
  if (task.effort === 'Heavy' && hasNoProgress(task)) return true
  if (hasWeakClarity(task)) return true
  return false
}

function stripLeadingVerb(title = '') {
  return title
    .replace(/^(clean|organize|pick up|put away|sort|wash|call|review|fix|plan)\s+/i, '')
    .trim()
}

function generateBreakdownTitle(task) {
  const rawTitle = task.title?.trim() ?? ''
  const lowerTitle = rawTitle.toLowerCase()
  const detail = stripLeadingVerb(rawTitle)

  if (task.effort === 'Heavy') return `Work on ${lowerTitle} for 10 minutes`
  if (/^clean\s+/i.test(rawTitle)) return detail ? `Clean one small area of ${detail}` : 'Clean one small area'
  if (/^pick up\s+/i.test(rawTitle)) return detail ? `Pick up 3 ${detail}` : 'Pick up 3 items'
  if (/^organize\s+/i.test(rawTitle)) return detail ? `Organize one small part of ${detail}` : 'Organize one small section'
  if (/^put away\s+/i.test(rawTitle)) return detail ? `Put away 3 ${detail}` : 'Put away 3 items'
  if (/^wash\s+/i.test(rawTitle)) return detail ? `Wash one load of ${detail}` : 'Wash one load'
  if (/^call\s+/i.test(rawTitle)) return detail ? `Open contact info for ${detail}` : 'Open contact info and place the call'
  if (/^review\s+/i.test(rawTitle)) return detail ? `Open ${detail} and review the first step` : 'Open it and review the first step'
  if (/^fix\s+/i.test(rawTitle)) return detail ? `Look at ${detail} and do the first repair step` : 'Do the first repair step'
  if (/^plan\s+/i.test(rawTitle)) return detail ? `Write the first next step for ${detail}` : 'Write the first next step'
  return rawTitle ? `Open ${lowerTitle} and do the first step` : 'Open it and do the first step'
}

export function createBreakdownTask(task) {
  if (!shouldBreakDownTask(task)) return null

  return {
    ...task,
    id: `breakdown:${task.id}`,
    title: generateBreakdownTitle(task),
    clarity: '',
    whyThisMatters: '',
    isBrokenDown: true,
    parentTaskId: task.id,
    originalTitle: task.title,
    breakdownLabel: hasWeakClarity(task) ? 'Start here' : 'Adjusted to get you started',
  }
}

export function getTaskHealth(task) {
  const friction = getTaskFriction(task)
  if (friction >= FRICTION_BLOCK_THRESHOLD) return 'broken'
  if (friction >= 35) return 'at_risk'
  return 'healthy'
}

export function getFrictionFix(task) {
  if (!hasClearOutcome(task)) return 'Add a clear done definition before starting'
  if (!toDate(task.dueDate)) return 'Choose a time so this can surface cleanly'
  if ((task.snoozeCount ?? 0) >= 2) return 'Decide whether to reschedule, split, or remove it'
  if (taskAgeDays(task) >= 3) return 'Refresh the timing or break this into a smaller step'
  if (task.effort === 'Heavy') return 'Break this into a smaller first move'
  return 'Tighten this task before it becomes the next step'
}

export function shouldShowFrictionFix(task) {
  return getTaskFriction(task) > FRICTION_BLOCK_THRESHOLD
}

export function getPriorityScore(task, currentUserId, options = {}) {
  const status = getTaskStatus(task)
  if (status === TASK_STATUS.COMPLETED || task.isMissed || isSnoozed(task)) return -Infinity

  let score = 0
  const assignedToMe = task.assignedTo === currentUserId || task.assignedTo === BOTH_ASSIGNEE_ID

  if (isOverdue(task)) score += 90
  if (isDueWithinHours(task, 0, 24)) score += 70
  if (status === TASK_STATUS.IN_PROGRESS) score += 65
  if (assignedToMe) score += 45
  if (task.whyThisMatters?.trim()) score += 12
  if (task.effort === 'Quick') score += 10
  if (task.effort === 'Heavy') score -= 8
  if (task.acknowledgedAt) score += 8
  if (isToday(toDate(task.dueDate) ?? 0)) score += 8
  if ((task.snoozeCount ?? 0) >= 2) score += 10
  if (taskAgeDays(task) >= 3) score += 8
  if (options.lowEnergyMode && task.effort === 'Quick') score += 12
  if (options.lowEnergyMode && task.effort === 'Heavy') score -= 20

  return score - Math.round(getTaskFriction(task) * 0.35)
}

export function deriveDoThisNextSignals(tasks, goals = DEFAULT_USER_GOALS) {
  const completed = tasks.filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
  const missed = tasks.filter((task) => task.isMissed)
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const todayKey = format(now, 'yyyy-MM-dd')
  const weekHandled = completed.filter((task) => {
    const completedAt = toDate(task.completedAt)
    return completedAt && completedAt >= weekStart && completedAt <= weekEnd
  }).length
  const todayHandled = completed.filter((task) => {
    const completedAt = toDate(task.completedAt)
    return completedAt && format(completedAt, 'yyyy-MM-dd') === todayKey
  }).length
  const reliability = completed.length + missed.length
    ? Math.round((completed.length / (completed.length + missed.length)) * 100)
    : 100
  const expectedByNow = Math.ceil((goals.weeklyCompletion * (((now.getDay() + 6) % 7) + 1)) / 7)
  const recentCompletionCutoff = subDays(now, 1)
  const streakActive = completed.some((task) => {
    const completedAt = toDate(task.completedAt)
    return completedAt && completedAt >= recentCompletionCutoff
  })

  return {
    isBehindWeekly: weekHandled < expectedByNow,
    needsDailyCompletion: todayHandled < goals.dailyMinimum,
    belowReliabilityTarget: reliability < goals.reliabilityTarget,
    streakActive,
    weekHandled,
    todayHandled,
    reliability,
    expectedByNow,
  }
}

function getAvoidancePenalty(task) {
  const snoozeCount = task.snoozeCount ?? 0
  if (snoozeCount < 2) return 0
  return Math.min(18, snoozeCount * 6)
}

function getGoalBoost(task, signals) {
  let boost = 0

  if (signals.isBehindWeekly && task.effort === 'Quick') boost += 18

  if (signals.needsDailyCompletion) {
    if (task.effort === 'Quick') boost += 16
    else if (task.effort === 'Medium') boost += 8
  }

  if (signals.belowReliabilityTarget && isDueWithinHours(task, 0, 24)) boost += 14

  return boost
}

function getMomentumBoost(task, signals) {
  let boost = 0
  const status = getTaskStatus(task)

  if (signals.streakActive && task.effort === 'Quick') boost += 10
  if (status === TASK_STATUS.IN_PROGRESS) boost += 10
  if (task.acknowledgedAt) boost += 4

  return boost
}

function getDoThisNextScore(task, tasks, currentUserId, options = {}) {
  const priorityScore = getPriorityScore(task, currentUserId, options)
  if (!Number.isFinite(priorityScore)) return priorityScore

  const signals = options.goalSignals ?? deriveDoThisNextSignals(tasks, options.goals ?? DEFAULT_USER_GOALS)
  const goalBoost = getGoalBoost(task, signals)
  const momentumBoost = getMomentumBoost(task, signals)
  const avoidancePenalty = getAvoidancePenalty(task)

  return priorityScore + goalBoost + momentumBoost - avoidancePenalty
}

export function getPriorityReason(task, currentUserId, options = {}, variant = 0) {
  const status = getTaskStatus(task)
  const partnerAssigned = task.assignedTo && task.assignedTo !== currentUserId && task.assignedTo !== BOTH_ASSIGNEE_ID
  const quickPhrases = ['Quick win - easy to handle now', 'Fast to clear right now', 'Low effort and ready to finish']
  const overduePhrases = ['Overdue and needs attention', 'Past due - good time to clear it', 'Needs attention now']

  if (partnerAssigned) return 'Assigned to Megan - check if it is covered'
  if (isOverdue(task) && task.effort === 'Quick') return 'Overdue and quick to finish\nClears it off your list fast'
  if (isOverdue(task)) return overduePhrases[variant % overduePhrases.length]
  if (isDueWithinHours(task, 0, 24)) return 'Due soon - best to handle it now'
  if (status === TASK_STATUS.IN_PROGRESS) return 'Already started - finish while it is active'
  if (options.lowEnergyMode && task.effort === 'Quick') return 'Low effort - fits your energy right now'
  if (task.whyThisMatters?.trim()) return 'Clear impact - worth finishing'
  if (task.effort === 'Quick') return quickPhrases[variant % quickPhrases.length]
  if (taskAgeDays(task) >= 3) return 'This has been sitting - good time to clear it'
  if (task.acknowledgedAt) return 'You marked it seen - ready to follow through'
  return 'Good next step to keep things moving'
}

export function getDoThisNextMessage(task, tasks, currentUserId, options = {}, variant = 0) {
  const signals = options.goalSignals ?? deriveDoThisNextSignals(tasks, options.goals ?? DEFAULT_USER_GOALS)

  if (signals.needsDailyCompletion && task.effort === 'Quick') return 'Quick win to get back on pace'
  if (signals.streakActive && (task.effort === 'Quick' || task.acknowledgedAt)) return 'Keep your streak alive'
  if (signals.belowReliabilityTarget && isDueWithinHours(task, 0, 24)) return 'Best handled now'
  if ((task.snoozeCount ?? 0) >= 2) return 'Worth clearing before it slips again'

  return getPriorityReason(task, currentUserId, options, variant)
}

function sameDueWindow(a, b) {
  const aDue = toDate(a?.dueDate)
  const bDue = toDate(b?.dueDate)
  if (!aDue && !bDue) return true
  if (!aDue || !bDue) return false
  return Math.abs(differenceInHours(aDue, bDue)) <= 24
}

function sameRepeatWindow(a, b) {
  if ((a.repeatType ?? 'none') !== (b.repeatType ?? 'none')) return false
  const aDays = (a.repeatDays ?? []).join('|')
  const bDays = (b.repeatDays ?? []).join('|')
  return aDays === bDays
}

export function detectDuplicateTask(tasks, candidateTask, editingTaskId = null) {
  const normalizedCandidate = normalizeDuplicateTitle(candidateTask.title)
  if (!normalizedCandidate) return null

  return (
    tasks.find((task) => {
      if (task.id === editingTaskId) return false
      if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return false
      if (task.isMissed) return false
      if (task.assignedTo !== candidateTask.assignedTo) return false

      const similarity = titleSimilarity(task.title, candidateTask.title)
      if (similarity < 0.85) return false

      return sameRepeatWindow(task, candidateTask) || sameDueWindow(task, candidateTask)
    }) ?? null
  )
}

function sortByPriority(tasks, currentUserId, options = {}) {
  return [...tasks].sort((a, b) => {
    const scoreDelta = getPriorityScore(b, currentUserId, options) - getPriorityScore(a, currentUserId, options)
    if (scoreDelta !== 0) return scoreDelta
    const effortDelta = (EFFORT_WEIGHT[a.effort] ?? 9) - (EFFORT_WEIGHT[b.effort] ?? 9)
    if (effortDelta !== 0) return effortDelta
    return (toDate(a.dueDate)?.getTime() ?? Infinity) - (toDate(b.dueDate)?.getTime() ?? Infinity)
  })
}

export function selectDoThisNextTask(tasks, currentUserId, options = {}) {
  const goalSignals = options.goalSignals ?? deriveDoThisNextSignals(tasks, options.goals ?? DEFAULT_USER_GOALS)
  const activeTasks = tasks.filter(
    (task) =>
      getTaskStatus(task) !== TASK_STATUS.COMPLETED &&
      !task.isMissed &&
      !isSnoozed(task),
  )
  const meaningfulTasks = activeTasks.filter((task) => {
    if (shouldShowFrictionFix(task)) return true
    if (isOverdue(task)) return true
    if (isDueWithinHours(task, 0, 24)) return true
    if (getTaskStatus(task) === TASK_STATUS.IN_PROGRESS) return true
    return false
  })
  const [topTask] = [...meaningfulTasks].sort((a, b) => {
    const scoreDelta = getDoThisNextScore(b, tasks, currentUserId, { ...options, goalSignals }) - getDoThisNextScore(a, tasks, currentUserId, { ...options, goalSignals })
    if (scoreDelta !== 0) return scoreDelta
    const effortDelta = (EFFORT_WEIGHT[a.effort] ?? 9) - (EFFORT_WEIGHT[b.effort] ?? 9)
    if (effortDelta !== 0) return effortDelta
    return (toDate(a.dueDate)?.getTime() ?? Infinity) - (toDate(b.dueDate)?.getTime() ?? Infinity)
  })
  if (!topTask) return null
  return getDoThisNextScore(topTask, tasks, currentUserId, { ...options, goalSignals }) >= PRIORITY_THRESHOLD ? topTask : null
}

export function getDraggingTasks(tasks, currentUserId, options = {}) {
  const now = new Date()
  return sortByPriority(
    tasks.filter((task) => {
      if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return false
      if (task.isMissed) return false
      if (getTaskHealth(task) !== 'healthy') return true
      if (isOverdue(task)) return true
      if ((task.snoozeCount ?? 0) >= 2) return true
      const lastTouched = toDate(task.lastActionAt ?? task.createdAt)
      if (!lastTouched) return false
      return differenceInHours(now, lastTouched) >= 72
    }),
    currentUserId,
    options,
  )
}

export function getRepeatCandidates(tasks) {
  const grouped = new Map()
  tasks
    .filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
    .forEach((task) => {
      const key = normalizeDuplicateTitle(task.title)
      if (!key) return
      const current = grouped.get(key) ?? []
      grouped.set(key, [...current, task])
    })

  return [...grouped.values()]
    .filter((group) => group.length >= 2)
    .map((group) =>
      group
        .slice()
        .sort((a, b) => (toDate(b.completedAt)?.getTime() ?? 0) - (toDate(a.completedAt)?.getTime() ?? 0))[0],
    )
}

export function getQuickWins(tasks, currentUserId, options = {}) {
  const seen = new Set()
  return sortByPriority(
    tasks
      .filter((task) => {
        if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return false
        if (task.isMissed) return false
        if (task.effort !== 'Quick') return false
        if (getTaskHealth(task) === 'broken') return false
        if (!toDate(task.dueDate)) return false
        return differenceInHours(toDate(task.dueDate), new Date()) <= 48
      }),
    currentUserId,
    options,
  )
    .filter((task) => getPriorityScore(task, currentUserId, options) >= 20)
    .filter((task) => {
      const key = normalizeDuplicateTitle(task.title)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 3)
}

export function getNotificationCandidates(tasks, currentUserId, options = {}) {
  return sortByPriority(
    tasks.filter((task) => {
      if (hasRecentNotification(task)) return false
      return getPriorityScore(task, currentUserId, options) >= 70
    }),
    currentUserId,
    options,
  )
}

export function getSmartRetryDate(task) {
  const dueDate = toDate(task.dueDate)
  const base = dueDate ?? new Date()
  if (dueDate && isSaturday(dueDate)) return addDays(base, 7)
  if (dueDate && isSunday(dueDate)) return addDays(base, 6)
  if (dueDate) return addDays(base, 7)

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return tomorrow
}
