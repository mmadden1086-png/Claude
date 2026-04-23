import { isToday } from 'date-fns'
import { TASK_STATUS } from './constants'
import { getTaskStatus, isOverdue, toDate } from './format'
import { sanitizeWhyText } from './relationalWhyEngine'

const VAGUE_TOKENS = new Set(['stuff', 'things', 'misc', 'thing', 'item', 'items'])

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function isClearTask(task) {
  const tokens = normalizeTitle(task.title)
  if (!tokens.length) return false
  if (tokens.some((token) => VAGUE_TOKENS.has(token))) return false
  if (task.clarity?.trim()) return true
  return tokens.length >= 2
}

function isTrivialQuickTask(task) {
  return task.effort === 'Quick' && isClearTask(task)
}

function getSimilarTaskBehavior(task, tasks = []) {
  const titleKey = normalizeTitle(task.title).join(' ')
  if (!titleKey) return { snoozedOrIgnored: false }

  const similarTasks = tasks.filter((candidate) => normalizeTitle(candidate.title).join(' ') === titleKey)
  const snoozedOrIgnored = similarTasks.some((candidate) => {
    const status = getTaskStatus(candidate)
    return (candidate.snoozeCount ?? 0) >= 1 || candidate.isMissed || status === TASK_STATUS.SNOOZED
  })

  return { snoozedOrIgnored }
}

function firstLine(text = '') {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? ''
}

export function scoreWhyStrength(task, currentUserId, tasks = []) {
  const status = getTaskStatus(task)
  const requestedByPartner = Boolean(task.requestedBy && task.requestedBy !== currentUserId)
  const overdue = isOverdue(task)
  const dueToday = (() => {
    const dueDate = toDate(task.dueDate)
    return dueDate ? isToday(dueDate) : false
  })()
  const { snoozedOrIgnored } = getSimilarTaskBehavior(task, tasks)

  if (status === TASK_STATUS.COMPLETED) return 0
  if (status === TASK_STATUS.IN_PROGRESS) return 0
  if (isTrivialQuickTask(task)) return 0

  let score = 0
  if (requestedByPartner) score += 2
  if (overdue) score += 1
  if (dueToday) score += 1
  if (snoozedOrIgnored) score += 1
  if (task.effort === 'Quick' && isClearTask(task)) score -= 1
  if (status === TASK_STATUS.IN_PROGRESS) score -= 1

  if (requestedByPartner && overdue) return Math.max(score, 3)
  if ((task.snoozeCount ?? 0) >= 2) return Math.max(score, 3)

  return Math.max(0, Math.min(5, score))
}

export function getWhyDisplayDecision(task, whyText, currentUserId, tasks = []) {
  const score = scoreWhyStrength(task, currentUserId, tasks)
  const safeWhyText = sanitizeWhyText(whyText)

  if (!safeWhyText) {
    return { score, mode: 'hidden', text: '' }
  }

  if (score < 2) {
    return { score, mode: 'hidden', text: '' }
  }

  if (score === 2) {
    return { score, mode: 'short', text: firstLine(safeWhyText) }
  }

  return { score, mode: 'full', text: safeWhyText }
}
