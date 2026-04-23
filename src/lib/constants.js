export const USERS = [
  { id: 'matt', name: 'Matt', email: 'mmadden1086@gmail.com' },
  { id: 'megan', name: 'Megan', email: 'Meganlmadden@yahoo.com' },
]

export const BOTH_ASSIGNEE_ID = 'both'

export function getCanonicalUserName(email, fallback = 'Partner') {
  const normalizedEmail = email?.toLowerCase()
  const matchedUser = USERS.find((user) => user.email.toLowerCase() === normalizedEmail)
  return matchedUser?.name ?? fallback
}

export const DEFAULT_WEEKLY_GOAL = 10
export const DEFAULT_DAILY_MINIMUM = 1
export const DEFAULT_RELIABILITY_TARGET = 85
export const DEFAULT_USER_GOALS = {
  weeklyCompletion: DEFAULT_WEEKLY_GOAL,
  dailyMinimum: DEFAULT_DAILY_MINIMUM,
  reliabilityTarget: DEFAULT_RELIABILITY_TARGET,
}

export const FILTERS = [
  { id: 'mine', label: 'Me' },
  { id: 'partner', label: 'Partner' },
  { id: 'all', label: 'Both' },
]

export const URGENCY_OPTIONS = ['Today', 'This week', 'Whenever']
export const EFFORT_OPTIONS = ['Quick', 'Medium', 'Heavy']
export const CATEGORY_OPTIONS = ['Home', 'Kids', 'Money', 'Relationship', 'Health', 'Errands']
export const REPEAT_OPTIONS = ['none', 'weekly', 'biweekly', 'monthly', 'specific-days']
export const WEEKDAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const TASK_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SNOOZED: 'snoozed',
}
export const SNOOZE_OPTIONS = [
  { id: 'tomorrow', label: 'Tomorrow', days: 1 },
  { id: 'weekend', label: 'Weekend', days: 3 },
  { id: 'next-week', label: 'Next week', days: 7 },
  { id: 'custom', label: 'Custom', days: 14 },
]
export const ACTION_SNOOZE_OPTIONS = [
  { id: '1-hour', label: '1 hour' },
  { id: '3-hours', label: '3 hours' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow-morning', label: 'Tomorrow morning' },
]
export const RESCHEDULE_OPTIONS = [
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'next-week', label: 'Next week' },
  { id: 'custom', label: 'Custom date' },
]

export const CLARITY_SUGGESTIONS = [
  { match: 'call', suggestion: 'Call completed and outcome noted' },
  { match: 'schedule', suggestion: 'Appointment booked and confirmed' },
  { match: 'pick up', suggestion: 'Item picked up and brought home' },
  { match: 'buy', suggestion: 'Item purchased' },
  { match: 'clean', suggestion: 'Area cleaned and reset' },
  { match: 'pay', suggestion: 'Payment submitted and confirmed' },
  { match: 'email', suggestion: 'Email sent and response handled' },
]

export const REPEAT_SUGGESTIONS = [
  { match: 'trash', repeatType: 'weekly' },
  { match: 'dog food', repeatType: 'biweekly' },
]

export const CATEGORY_KEYWORDS = [
  { match: ['school', 'kid', 'doctor', 'pediatrician'], category: 'Kids' },
  { match: ['bill', 'pay', 'insurance', 'bank'], category: 'Money' },
  { match: ['date', 'gift', 'flowers'], category: 'Relationship' },
  { match: ['clean', 'trash', 'dog food', 'groceries'], category: 'Home' },
  { match: ['pharmacy', 'doctor', 'workout'], category: 'Health' },
  { match: ['pick up', 'drop off', 'buy'], category: 'Errands' },
]

export const EFFORT_KEYWORDS = [
  { match: ['call', 'email', 'text', 'trash'], effort: 'Quick' },
  { match: ['buy', 'schedule', 'pick up'], effort: 'Medium' },
  { match: ['clean garage', 'taxes', 'deep clean'], effort: 'Heavy' },
]

export const POINTS_BY_EFFORT = {
  Quick: 1,
  Medium: 2,
  Heavy: 3,
}

export const TASK_STATUS_LABELS = {
  [TASK_STATUS.NOT_STARTED]: 'Open',
  [TASK_STATUS.IN_PROGRESS]: 'In progress',
  [TASK_STATUS.SNOOZED]: 'Snoozed',
  [TASK_STATUS.COMPLETED]: 'Completed',
}
