import { differenceInCalendarDays, format, isAfter } from 'date-fns'
import { toDate } from './format'

const CHECK_IN_DISMISS_STORAGE_KEY = 'follow-through-check-in-dismissed'

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function readDismissed() {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem(CHECK_IN_DISMISS_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writeDismissed(entry) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CHECK_IN_DISMISS_STORAGE_KEY, JSON.stringify(entry))
}

export function getCheckInState(checkIn = {}, now = new Date()) {
  const lastCompletedAt = toDate(checkIn.lastCompletedAt)
  const nextPlannedAt = toDate(checkIn.nextPlannedAt)
  const daysSinceLastCheckIn = lastCompletedAt ? differenceInCalendarDays(now, lastCompletedAt) : 7

  if (nextPlannedAt && isAfter(nextPlannedAt, now)) {
    return {
      status: 'scheduled',
      text: `Check-in planned for ${format(nextPlannedAt, 'MMM d, h:mm a')}`,
      cta: 'View details',
      daysSinceLastCheckIn,
      nextPlannedAt: nextPlannedAt.toISOString(),
    }
  }

  if (daysSinceLastCheckIn >= 7) {
    return {
      status: 'overdue',
      text: "It's been over a week since your last check-in",
      cta: 'Set time now',
      daysSinceLastCheckIn,
      nextPlannedAt: null,
    }
  }

  if (daysSinceLastCheckIn >= 6) {
    return {
      status: 'upcoming',
      text: "You're coming up on a week since your last check-in",
      cta: 'Plan check-in',
      daysSinceLastCheckIn,
      nextPlannedAt: null,
    }
  }

  return {
    status: 'recent',
    text: '',
    cta: '',
    daysSinceLastCheckIn,
    nextPlannedAt: null,
  }
}

export function getCheckInDismissKey(state, now = new Date()) {
  if (!state || state.status === 'recent') return ''
  return `${dayKey(now)}:${state.status}:${state.nextPlannedAt ?? 'none'}`
}

export function isCheckInDismissedForToday(state, now = new Date()) {
  const key = getCheckInDismissKey(state, now)
  if (!key) return false
  return readDismissed()?.key === key
}

export function dismissCheckInForToday(state, now = new Date()) {
  const key = getCheckInDismissKey(state, now)
  if (!key) return
  writeDismissed({ key, dismissedAt: now.toISOString() })
}
