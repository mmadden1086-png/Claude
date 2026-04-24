import { addHours, addMonths, endOfMonth, format, isSameMonth, startOfMonth } from 'date-fns'
import { TASK_STATUS } from './constants'
import { getTaskStatus, normalizeTimeValue, toDate } from './format'

export const DATE_BUDGET_OPTIONS = ['Any', 'Free', 'Low', 'Medium', 'High']
export const DATE_DURATION_OPTIONS = ['Any', '30-60 min', '1-2 hours', '2-4 hours', 'Half day']
export const DATE_CATEGORY_OPTIONS = ['At home', 'Outing', 'Food', 'Creative', 'Adventure', 'Relaxing']
export const DATE_LOCATION_OPTIONS = ['Home', 'Out', 'Either']
export const STARTER_DATE_IDEAS = [
  {
    id: 'starter-coffee-walk',
    title: 'Coffee and a walk',
    description: 'Pick a coffee spot and take a short walk together after.',
    category: 'Outing',
    budgetLevel: 'Low',
    duration: '1-2 hours',
    locationType: 'Out',
    tags: ['starter'],
  },
  {
    id: 'starter-movie-home',
    title: 'Movie night at home',
    description: 'Choose one movie, grab snacks, and keep the night easy.',
    category: 'At home',
    budgetLevel: 'Free',
    duration: '2-4 hours',
    locationType: 'Home',
    tags: ['starter'],
  },
  {
    id: 'starter-dessert-run',
    title: 'Dessert run',
    description: 'Go out just for dessert and keep it simple.',
    category: 'Food',
    budgetLevel: 'Low',
    duration: '30-60 min',
    locationType: 'Out',
    tags: ['starter'],
  },
]

export function getDateIdeaPool(dateIdeas = []) {
  return dateIdeas?.length ? dateIdeas : STARTER_DATE_IDEAS
}

function averageRating(history = []) {
  if (!history.length) return 0
  return history.reduce((sum, item) => sum + (item.rating ?? 0), 0) / history.length
}

function latestHistoryEntry(ideaId, history = []) {
  return history
    .filter((item) => item.ideaId === ideaId)
    .slice()
    .sort((a, b) => (toDate(b.dateCompleted)?.getTime() ?? 0) - (toDate(a.dateCompleted)?.getTime() ?? 0))[0] ?? null
}

function monthsSince(value) {
  const date = toDate(value)
  if (!date) return Infinity
  const now = new Date()
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
}

function getIdeaHistory(idea, history = []) {
  const entries = history.filter((item) => item.ideaId === idea.id)
  const latest = latestHistoryEntry(idea.id, history)
  const rating = averageRating(entries)
  const lastMonthsAgo = monthsSince(latest?.dateCompleted)
  const recentlyRejected = entries.some((item) => item.wouldRepeat === false && monthsSince(item.dateCompleted) <= 3)
  const repeatVotes = entries.reduce(
    (accumulator, item) => {
      if (item.wouldRepeat === true) accumulator.positive += 1
      if (item.wouldRepeat === false) accumulator.negative += 1
      return accumulator
    },
    { positive: 0, negative: 0 },
  )

  return {
    entries,
    latest,
    rating,
    lastMonthsAgo,
    recentlyRejected,
    repeatVotes,
  }
}

function getRatingBoost(rating) {
  if (rating >= 4.5) return 28
  if (rating >= 4) return 20
  if (rating >= 3) return 8
  if (rating > 0 && rating <= 2) return -22
  return 12
}

function getUnusedBoost(lastMonthsAgo) {
  if (lastMonthsAgo === Infinity) return 24
  if (lastMonthsAgo >= 6) return 18
  if (lastMonthsAgo >= 3) return 10
  return 0
}

function getRecentPenalty(lastMonthsAgo) {
  if (lastMonthsAgo <= 2) return 55
  if (lastMonthsAgo <= 3) return 35
  if (lastMonthsAgo <= 5) return 12
  return 0
}

function getRepeatPreferenceBoost(historyMeta) {
  const latestWouldRepeat = historyMeta.latest?.wouldRepeat
  if (latestWouldRepeat === true) return 16
  if (latestWouldRepeat === false) return -28

  if (historyMeta.repeatVotes.positive > historyMeta.repeatVotes.negative) return 10
  if (historyMeta.repeatVotes.negative > historyMeta.repeatVotes.positive) return -16
  return 0
}

function explainWhyFits(idea, filters, historyMeta) {
  if (filters.budget !== 'Any' && filters.duration !== 'Any') return 'Fits your budget and time'
  if (idea.locationType === 'Home' && idea.duration === '30-60 min') return 'Easy to do at home'
  if (idea.locationType === 'Either') return 'Flexible and easy to fit in'
  if (historyMeta.rating >= 4) return 'Highly rated and easy to plan'
  if (historyMeta.lastMonthsAgo >= 3 || historyMeta.lastMonthsAgo === Infinity) return "Haven't done this in a while"
  if (filters.category !== 'Any') return `Fits the ${filters.category.toLowerCase()} mood`
  return 'Good fit for this month'
}

function getSuggestionLabel(historyMeta) {
  if (historyMeta.lastMonthsAgo >= 3 || historyMeta.lastMonthsAgo === Infinity) return "Haven't done this in a while"
  if (historyMeta.rating >= 4) return 'Highly rated'
  return ''
}

function matchesFilters(idea, filters) {
  if (filters.budget && filters.budget !== 'Any' && idea.budgetLevel !== filters.budget) return false
  if (filters.duration && filters.duration !== 'Any' && idea.duration !== filters.duration) return false
  if (filters.category && filters.category !== 'Any' && idea.category !== filters.category) return false
  return true
}

function enrichIdea(idea, history, filters) {
  const historyMeta = getIdeaHistory(idea, history)
  const logisticsBoost = idea.locationType === 'Either' ? 6 : idea.locationType ? 3 : 0
  const score =
    getRatingBoost(historyMeta.rating) +
    getUnusedBoost(historyMeta.lastMonthsAgo) +
    getRepeatPreferenceBoost(historyMeta) +
    logisticsBoost -
    getRecentPenalty(historyMeta.lastMonthsAgo)

  return {
    idea,
    score,
    whyFits: explainWhyFits(idea, filters, historyMeta),
    label: getSuggestionLabel(historyMeta),
    historyMeta,
  }
}

export function createDateIdeaPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category || '',
    budgetLevel: form.budgetLevel || '',
    duration: form.duration || '',
    locationType: form.locationType || '',
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  }
}

export function scoreDateIdea(idea, history = []) {
  return enrichIdea(idea, history, { budget: 'Any', duration: 'Any', category: 'Any' }).score
}

export function generateDateSuggestions(ideas = [], history = [], filters) {
  return ideas
    .filter((idea) => matchesFilters(idea, filters))
    .map((idea) => enrichIdea(idea, history, filters))
    .filter((entry) => !entry.historyMeta.recentlyRejected)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

export function pickDateForUs(ideas = [], history = [], filters) {
  const candidates = generateDateSuggestions(ideas, history, filters)
  if (!candidates.length) return null

  const weighted = candidates.map((candidate) => ({
    ...candidate,
    weight: Math.max(1, candidate.score + 60),
  }))
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  let cursor = Math.random() * totalWeight

  for (const candidate of weighted) {
    cursor -= candidate.weight
    if (cursor <= 0) return candidate
  }

  return weighted[0]
}

function thisMonthRange(baseDate = new Date()) {
  return {
    start: startOfMonth(baseDate),
    end: endOfMonth(baseDate),
  }
}

export function getMonthlyDateStatus(tasks = [], dateHistory = [], now = new Date()) {
  const { start, end } = thisMonthRange(now)
  const currentMonthTasks = tasks.filter((task) => {
    if (!isDateNightTask(task)) return false
    const dueDate = toDate(task.dueDate)
    return dueDate && dueDate >= start && dueDate <= end
  })
  const completedThisMonth = dateHistory.filter((entry) => {
    const completedAt = toDate(entry.dateCompleted)
    return completedAt && isSameMonth(completedAt, now)
  })
  const lastDate = dateHistory
    .slice()
    .sort((a, b) => (toDate(b.dateCompleted)?.getTime() ?? 0) - (toDate(a.dateCompleted)?.getTime() ?? 0))[0] ?? null

  const status = completedThisMonth.length
    ? 'completed'
    : currentMonthTasks.length
      ? 'planned'
      : 'not_planned'

  return {
    status,
    hasPlannedDate: currentMonthTasks.length > 0,
    hasCompletedDate: completedThisMonth.length > 0,
    plannedTask: currentMonthTasks[0] ?? null,
    currentMonthTasks,
    completedThisMonth,
    lastDate,
    midMonthReminder: now.getDate() >= 15 && !currentMonthTasks.length && !completedThisMonth.length,
  }
}

export function isDateNightTask(task) {
  return Boolean(task?.dateIdeaId || task?.title?.toLowerCase().startsWith('date night:'))
}

export function getDateNightIdeaTitle(task) {
  return task?.dateIdeaTitle || task?.title?.replace(/^date night:\s*/i, '') || task?.title || 'Date night'
}

export function getDateNightDueAt(task) {
  const dueDate = toDate(task?.dueDate)
  if (!dueDate) return null

  const normalizedTime = normalizeTimeValue(task?.dueTime)
  if (!normalizedTime || !/^\d{2}:\d{2}$/.test(normalizedTime)) {
    const fallback = new Date(dueDate)
    fallback.setHours(18, 0, 0, 0)
    return fallback
  }

  const [hours, minutes] = normalizedTime.split(':').map(Number)
  const nextDate = new Date(dueDate)
  nextDate.setHours(hours, minutes, 0, 0)
  return nextDate
}

export function getDateNightReminderMoments(task) {
  const dueAt = getDateNightDueAt(task)
  if (!dueAt) return null

  const nextMorningAt = new Date(dueAt)
  nextMorningAt.setDate(nextMorningAt.getDate() + 1)
  nextMorningAt.setHours(8, 0, 0, 0)

  return {
    dueAt,
    preReminderAt: addHours(dueAt, -5),
    overdueReminderAt: addHours(dueAt, 2),
    nextMorningAt,
  }
}

export function getDateNightReminderState(task, now = new Date()) {
  if (!isDateNightTask(task)) return { eligible: false }
  if (getTaskStatus(task) === TASK_STATUS.COMPLETED) return { eligible: false }

  const moments = getDateNightReminderMoments(task)
  if (!moments) return { eligible: false }

  const { dueAt, preReminderAt, overdueReminderAt, nextMorningAt } = moments

  return {
    eligible: true,
    dueAt,
    preReminderReady: now >= preReminderAt && now < dueAt,
    overdueReminderReady: now >= overdueReminderAt && now < nextMorningAt,
    morningFollowUpReady: now >= nextMorningAt,
  }
}

function clampDay(day, date) {
  const end = endOfMonth(date).getDate()
  return Math.max(1, Math.min(day, end))
}

export function suggestDateTaskSchedule(entry, baseDate = new Date()) {
  const completedAt = toDate(entry?.dateCompleted)
  const targetMonth = thisMonthRange(baseDate).start
  if (!completedAt) return {
    dueDate: baseDate.toISOString(),
    dueTime: '',
  }

  const suggestedDate = new Date(targetMonth)
  suggestedDate.setDate(clampDay(completedAt.getDate(), suggestedDate))
  suggestedDate.setHours(Math.max(18, completedAt.getHours() || 18), completedAt.getMinutes() || 0, 0, 0)

  if (suggestedDate < baseDate) {
    const nextMonth = addMonths(baseDate, 1)
    nextMonth.setDate(clampDay(completedAt.getDate(), nextMonth))
    nextMonth.setHours(Math.max(18, completedAt.getHours() || 18), completedAt.getMinutes() || 0, 0, 0)
    return {
      dueDate: nextMonth.toISOString(),
      dueTime: format(nextMonth, 'HH:mm'),
    }
  }

  return {
    dueDate: suggestedDate.toISOString(),
    dueTime: format(suggestedDate, 'HH:mm'),
  }
}

export function buildDateTask(idea, currentUser, options = {}) {
  const baseDate = options.dueDate ? toDate(options.dueDate) ?? new Date() : new Date()
  return {
    title: `Date night: ${idea.title}`,
    notes: [options.tag ? `${options.tag} date idea.` : '', idea.description || ''].filter(Boolean).join(' '),
    assignedTo: 'both',
    dueDate: baseDate.toISOString(),
    dueTime: options.dueTime || '',
    urgency: 'This week',
    effort: 'Medium',
    category: 'Relationship',
    clarity: 'The date happens and you both get to enjoy it',
    whyThisMatters: 'Protects time together and keeps connection intentional',
    repeatType: 'none',
    repeatDays: [],
    requestedBy: currentUser.id,
    dateIdeaId: idea.id,
    dateIdeaTitle: idea.title,
    dateIdeaTag: options.tag || '',
  }
}

export function recentDateEntries(dateHistory = []) {
  return [...dateHistory]
    .sort((a, b) => (toDate(b.dateCompleted)?.getTime() ?? 0) - (toDate(a.dateCompleted)?.getTime() ?? 0))
    .slice(0, 6)
}

export function topRatedDateIdeas(dateIdeas = [], dateHistory = []) {
  return dateIdeas
    .map((idea) => {
      const historyMeta = getIdeaHistory(idea, dateHistory)
      return {
        idea,
        rating: historyMeta.rating,
        count: historyMeta.entries.length,
      }
    })
    .filter((entry) => entry.count > 0 && entry.rating >= 4)
    .sort((a, b) => b.rating - a.rating || b.count - a.count)
    .slice(0, 3)
}

export function dateNightActivitySummary(dateHistory = []) {
  const now = new Date()
  const thisMonthEntries = dateHistory.filter((entry) => {
    const completedAt = toDate(entry.dateCompleted)
    return completedAt && isSameMonth(completedAt, now)
  })
  const average = thisMonthEntries.length
    ? (thisMonthEntries.reduce((sum, entry) => sum + (entry.rating ?? 0), 0) / thisMonthEntries.length).toFixed(1)
    : '0.0'
  const monthKeys = new Set(
    dateHistory
      .map((entry) => toDate(entry.dateCompleted))
      .filter(Boolean)
      .map((date) => format(date, 'yyyy-MM')),
  )

  return {
    totalThisMonth: thisMonthEntries.length,
    averageRatingThisMonth: average,
    lastDate: recentDateEntries(dateHistory)[0] ?? null,
    monthsWithCompletion: monthKeys.size,
  }
}

export function repeatHistoryEntries(tasks) {
  return tasks
    .flatMap((task) =>
      (task.history ?? [])
        .filter((entry) => ['repeat-advanced', 'repeat-skipped', 'repeat-reactivated'].includes(entry.type))
        .map((entry) => ({
          id: `${task.id}:${entry.at}:${entry.type}`,
          taskId: task.id,
          taskTitle: task.title,
          type: entry.type,
          at: entry.at,
          nextDueDate: entry.nextDueDate ?? null,
        })),
    )
    .sort((a, b) => (toDate(b.at)?.getTime() ?? 0) - (toDate(a.at)?.getTime() ?? 0))
    .slice(0, 8)
}
