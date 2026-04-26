import { TASK_STATUS } from './constants'
import { getTaskStatus, toDate } from './format'

const ACCOUNTABILITY_STORAGE_KEY = 'follow-through-accountability-banner'

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function daysBetween(start, end = new Date()) {
  if (!start) return null
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

function taskAgeDays(task, now = new Date()) {
  return daysBetween(toDate(task.createdAt) ?? toDate(task.dueDate), now) ?? 0
}

function isUntouchedPartnerTask(task, currentUser, now = new Date()) {
  if (!currentUser?.id) return false
  if (!task.requestedBy || task.requestedBy === currentUser.id) return false
  if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return false
  if (task.acknowledgedAt || task.startedAt || task.inProgress) return false
  return taskAgeDays(task, now) > 3
}

function fallbackMessage(signal, rotation = 0) {
  const messages = {
    check_in_ignored: [
      "You haven't talked through things in over a week",
      'The check-in has been sitting for a while',
    ],
    check_in_missed: [
      "You haven't talked through things this week",
      'This week still needs a check-in',
    ],
    date_night_missed: [
      "You didn't make time together this month",
      'Date night still needs a plan this month',
    ],
    partner_tasks_escalated: [
      'A few things she added are still untouched',
      'Some partner asks have not moved yet',
    ],
    partner_tasks_flagged: [
      'A few partner asks need a first step',
      'Some partner tasks are waiting for movement',
    ],
  }

  const pool = messages[signal?.type] ?? ['Something needs a little attention today']
  return pool[rotation % pool.length]
}

function readStoredBanner() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem(ACCOUNTABILITY_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writeStoredBanner(entry) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACCOUNTABILITY_STORAGE_KEY, JSON.stringify(entry))
}

export function getAccountabilitySignals({ currentUser, tasks = [], monthlyDateStatus, now = new Date() }) {
  if (!currentUser) return null

  const daysSinceLastCheckIn = daysBetween(toDate(currentUser.checkIn?.lastCompletedAt ?? currentUser.lastCheckInAt), now)
  const untouchedPartnerTasks = tasks
    .filter((task) => isUntouchedPartnerTask(task, currentUser, now))
    .map((task) => ({ ...task, accountabilityAgeDays: taskAgeDays(task, now) }))
  const maxPartnerTaskAge = Math.max(0, ...untouchedPartnerTasks.map((task) => task.accountabilityAgeDays))

  if (daysSinceLastCheckIn !== null && daysSinceLastCheckIn >= 9) {
    return {
      type: 'check_in_ignored',
      label: 'Ignored check-in',
      days: daysSinceLastCheckIn,
      count: 1,
    }
  }

  if (daysSinceLastCheckIn === null || daysSinceLastCheckIn >= 7) {
    return {
      type: 'check_in_missed',
      label: 'Missed check-in',
      days: daysSinceLastCheckIn ?? 7,
      count: 1,
    }
  }

  if (!monthlyDateStatus?.hasCompletedDate) {
    return {
      type: 'date_night_missed',
      label: 'Missed date night',
      days: now.getDate(),
      count: 1,
    }
  }

  if (maxPartnerTaskAge > 5) {
    return {
      type: 'partner_tasks_escalated',
      label: 'Untouched partner tasks',
      days: maxPartnerTaskAge,
      count: untouchedPartnerTasks.length,
    }
  }

  if (untouchedPartnerTasks.length) {
    return {
      type: 'partner_tasks_flagged',
      label: 'Partner tasks waiting',
      days: maxPartnerTaskAge,
      count: untouchedPartnerTasks.length,
    }
  }

  return null
}

export async function getDailyAccountabilityMessage(signal, now = new Date()) {
  if (!signal) return ''

  const today = dayKey(now)
  const stored = readStoredBanner()
  if (stored?.date === today && stored?.type === signal.type && stored?.message) {
    return stored.message
  }

  const rotation = Math.floor(now.getTime() / 86400000)
  let message = fallbackMessage(signal, rotation)

  try {
    const response = await fetch('/suggestAccountability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    })
    if (response.ok) {
      const data = await response.json()
      if (typeof data.message === 'string' && data.message.trim()) {
        message = data.message.trim()
      }
    }
  } catch (error) {
    console.warn('Accountability AI message failed; using local fallback.', error)
  }

  writeStoredBanner({
    date: today,
    type: signal.type,
    message,
  })
  return message
}
