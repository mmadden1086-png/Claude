const DAY_MS = 24 * 60 * 60 * 1000

export const NOTIFICATION_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

const PRIORITY_WEIGHT = {
  checkIn: 3,
  partnerTasks: 2,
  dateNight: 1,
}

export const NOTIFICATION_MESSAGE_POOLS = {
  checkIn: {
    low: [
      'A quick check-in could help keep things aligned.',
      'This might be a good day to talk through the week.',
      'A short check-in could keep small things from piling up.',
    ],
    medium: [
      'It has been a little while since your last check-in.',
      'A check-in would probably help reset the week.',
      'You may want to make time for a quick check-in soon.',
    ],
    high: [
      'It has been too long since your last check-in.',
      'This needs a check-in before it turns into more friction.',
      'A check-in should probably be the next relationship reset.',
    ],
  },
  dateNight: {
    low: [
      'Date night is still open this month.',
      'This could be a good time to plan something together.',
      'A simple date night would keep the month intentional.',
    ],
    medium: [
      'Date night still needs a plan.',
      'The month is moving. It may be time to pick a date night.',
      'A small plan now can keep date night from slipping.',
    ],
    high: [
      'Date night is at risk of getting missed this month.',
      'This month still needs intentional time together.',
      'Pick something simple so date night does not fall off.',
    ],
  },
  partnerTasks: {
    low: [
      'A few partner tasks could use a first step.',
      'Some shared tasks are waiting for movement.',
      'There are a couple things your partner asked for that need attention.',
    ],
    medium: [
      'Some partner asks have been sitting for a few days.',
      'A few shared tasks need movement before they become friction.',
      'This would be a good time to handle one partner task.',
    ],
    high: [
      'Partner tasks are starting to sit too long.',
      'A few things your partner asked for need attention now.',
      'Handle one partner task today to reduce the drag.',
    ],
  },
}

function daysSince(dateValue, now = new Date()) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS))
}

export function getCheckInSeverity(days) {
  if (days === null) return NOTIFICATION_SEVERITY.MEDIUM
  if (days >= 10) return NOTIFICATION_SEVERITY.HIGH
  if (days >= 7) return NOTIFICATION_SEVERITY.MEDIUM
  if (days >= 5) return NOTIFICATION_SEVERITY.LOW
  return null
}

export function getDateNightSeverity(daysSinceDateNight, now = new Date()) {
  const dayOfMonth = now.getDate()

  if (daysSinceDateNight === null) {
    if (dayOfMonth >= 24) return NOTIFICATION_SEVERITY.HIGH
    if (dayOfMonth >= 15) return NOTIFICATION_SEVERITY.MEDIUM
    if (dayOfMonth >= 8) return NOTIFICATION_SEVERITY.LOW
    return null
  }

  if (daysSinceDateNight >= 45) return NOTIFICATION_SEVERITY.HIGH
  if (daysSinceDateNight >= 30) return NOTIFICATION_SEVERITY.MEDIUM
  if (daysSinceDateNight >= 21) return NOTIFICATION_SEVERITY.LOW
  return null
}

export function getPartnerTaskSeverity(count = 0, oldestAgeDays = 0) {
  if (!count) return null
  if (count >= 3 || oldestAgeDays >= 7) return NOTIFICATION_SEVERITY.HIGH
  if (count >= 2 || oldestAgeDays >= 4) return NOTIFICATION_SEVERITY.MEDIUM
  return NOTIFICATION_SEVERITY.LOW
}

function severityWeight(severity) {
  if (severity === NOTIFICATION_SEVERITY.HIGH) return 300
  if (severity === NOTIFICATION_SEVERITY.MEDIUM) return 200
  if (severity === NOTIFICATION_SEVERITY.LOW) return 100
  return 0
}

function pickMessage(pool, lastMessage, random = Math.random) {
  const choices = pool.filter((message) => message !== lastMessage)
  const usablePool = choices.length ? choices : pool
  const index = Math.floor(random() * usablePool.length)
  return usablePool[index]
}

function personalize(message, partnerName) {
  if (!partnerName) return message
  return message.replace('your partner', partnerName)
}

export function wasNotificationRecentlySent(lastNotificationSent, now = new Date()) {
  if (!lastNotificationSent) return false
  const sentAt = new Date(lastNotificationSent)
  if (Number.isNaN(sentAt.getTime())) return false
  return now.getTime() - sentAt.getTime() < DAY_MS
}

export function buildNotification({
  lastCheckInAt,
  lastDateNightAt,
  stalePartnerTasksCount = 0,
  oldestPartnerTaskAgeDays = 0,
  lastNotificationSent,
  lastMessage,
  partnerName,
  now = new Date(),
  throttle = true,
  random = Math.random,
} = {}) {
  if (throttle && wasNotificationRecentlySent(lastNotificationSent, now)) return null

  const checkInDays = daysSince(lastCheckInAt, now)
  const dateNightDays = daysSince(lastDateNightAt, now)

  const candidates = [
    {
      type: 'checkIn',
      severity: getCheckInSeverity(checkInDays),
      days: checkInDays,
    },
    {
      type: 'dateNight',
      severity: getDateNightSeverity(dateNightDays, now),
      days: dateNightDays,
    },
    {
      type: 'partnerTasks',
      severity: getPartnerTaskSeverity(stalePartnerTasksCount, oldestPartnerTaskAgeDays),
      count: stalePartnerTasksCount,
    },
  ].filter((candidate) => candidate.severity)

  if (!candidates.length) return null

  const winner = candidates
    .map((candidate) => ({
      ...candidate,
      score: severityWeight(candidate.severity) + PRIORITY_WEIGHT[candidate.type],
    }))
    .sort((a, b) => b.score - a.score)[0]

  const body = personalize(
    pickMessage(NOTIFICATION_MESSAGE_POOLS[winner.type][winner.severity], lastMessage, random),
    partnerName,
  )

  return {
    title: 'Follow Through',
    body,
    type: winner.type,
    severity: winner.severity,
  }
}
