import { hasEnoughContent, isGeneric } from './suggestionEngine'

const WHY_STORAGE_KEY = 'follow-through-why-patterns'
const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'and', 'or', 'in', 'on', 'with', 'my'])
const BLOCKED_PATTERNS = [
  'you do not respect',
  "you don't respect",
  'you never',
  'you should',
  'signals that you',
  'means you',
  'shows you are',
  'because you',
  'called this out',
  'respect the shared space',
  'helps',
  'follow-up',
  'follow up',
  'followed up',
  'handled',
  'managed',
  'productivity',
  'organized',
  'completed',
  'improves',
  'does not disappear',
  'comes back later',
]

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function tokenize(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token))
}

function hasMeaningfulNotes(notes = '') {
  return hasEnoughContent(notes) && !isGeneric(notes)
}

function mergedContext(task) {
  const notes = hasMeaningfulNotes(task.notes) ? task.notes : ''
  return `${notes} ${task.title}`.toLowerCase()
}

function getChildName(task) {
  const text = `${task.title} ${task.notes}`.toLowerCase()
  if (/\bmartin'?s?\b/.test(text)) return 'Martin'
  return 'they'
}

function getPersonName(task) {
  const text = `${task.title} ${task.notes}`.toLowerCase()
  if (/\bmartin'?s?\b/.test(text)) return 'Martin'
  if (/\bmegan'?s?\b/.test(text)) return 'Megan'
  if (/\bmatt'?s?\b/.test(text)) return 'Matt'
  if (/\b(he|him|his|she|her|hers|kid|child|son|daughter)\b/.test(text)) return 'they'
  return ''
}

function isSchoolShareContext(task) {
  const text = mergedContext(task)
  return (
    text.includes('show and tell') ||
    (text.includes('share') && Boolean(getPersonName(task))) ||
    (text.includes('bring') && (text.includes('class') || text.includes('school'))) ||
    (text.includes('share') && (text.includes('class') || text.includes('school')))
  )
}

function getCurrentUserId(context = {}) {
  const currentUser = context.currentUser ?? context
  if (typeof currentUser === 'string') return currentUser
  return currentUser?.id ?? null
}

function getStoredPatterns() {
  if (!canUseStorage()) return {}

  try {
    const raw = window.localStorage.getItem(WHY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setStoredPatterns(patterns) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(WHY_STORAGE_KEY, JSON.stringify(patterns))
  } catch {
    // Ignore storage write failures.
  }
}

function scoreTokenMatch(aTokens, bTokens) {
  const a = new Set(aTokens)
  const b = new Set(bTokens)
  if (!a.size || !b.size) return 0

  let overlap = 0
  a.forEach((token) => {
    if (b.has(token)) overlap += 1
  })

  return overlap / Math.max(a.size, b.size)
}

function isBlocked(text = '') {
  const normalized = text.toLowerCase()
  return BLOCKED_PATTERNS.some((pattern) => normalized.includes(pattern)) || isGeneric(normalized)
}

function limitWords(text = '', maxWords = 30) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ')
}

function getLearnedWhy(taskTitle) {
  const titleTokens = tokenize(taskTitle)
  if (!titleTokens.length) return ''

  const patterns = getStoredPatterns()
  const normalized = titleTokens.join(' ')
  if (patterns[normalized]?.why) return patterns[normalized].why

  let bestSuggestion = ''
  let bestScore = 0

  Object.entries(patterns).forEach(([key, value]) => {
    if (!value?.why) return
    const score = scoreTokenMatch(titleTokens, key.split(' '))
    if (score > bestScore) {
      bestScore = score
      bestSuggestion = value.why
    }
  })

  return bestScore >= 0.6 ? bestSuggestion : ''
}

function categoryLooksShared(category = '') {
  return ['Home', 'Kids', 'Money', 'Finance', 'Relationship', 'Errands'].includes(category)
}

export function getTaskSource(task, currentUser) {
  const currentUserId = getCurrentUserId(currentUser)
  const requestedBy = task?.requestedBy || task?.createdBy || null

  if (requestedBy && currentUserId && requestedBy !== currentUserId) return 'requested'
  if (categoryLooksShared(task?.category) || task?.assignedTo === 'both') return 'anticipated'
  return 'self'
}

function hasPhysicalObject(task) {
  const text = mergedContext(task)
  return [
    'bed',
    'bedroom',
    'bounce house',
    'car',
    'counter',
    'dish',
    'dog',
    'faucet',
    'garage',
    'gear',
    'groceries',
    'kitchen',
    'laundry',
    'room',
    'sink',
    'space',
    'trash',
    'yard',
  ].some((keyword) => text.includes(keyword))
}

function personWhy(task, context) {
  const source = getTaskSource(task, context.currentUser ?? context)
  const personName = getPersonName(task)

  if (isSchoolShareContext(task)) {
    const childName = getChildName(task)
    return childName === 'Martin' ? "So he's ready to bring something to share" : 'So they have something to share'
  }

  if (personName === 'Martin') return "So he's ready for it"
  if (personName === 'Megan') return "So Megan doesn't have to deal with it"
  if (personName === 'Matt') return "So Matt doesn't have to deal with it"
  if (personName) return 'So they are ready for it'
  if (source === 'requested') return "So they don't have to deal with it"
  return ''
}

function environmentWhy(task) {
  const text = mergedContext(task)
  if (text.includes('bounce house')) return 'Otherwise it just sits out'
  if (text.includes('kitchen') || text.includes('sink') || text.includes('counter')) return 'So the kitchen stays usable'
  if (text.includes('garage')) return 'So the garage stays usable'
  if (text.includes('trash') || text.includes('dog') || text.includes('poop')) return 'Otherwise it just sits there'
  if (text.includes('faucet') || text.includes('leak')) return 'So the problem does not get worse'
  if (text.includes('bed') || text.includes('room')) return 'So the room feels usable'
  return 'So the space stays usable'
}

function buildUseCaseWhy(task) {
  const text = mergedContext(task)
  if (text.includes('appointment') || text.includes('schedule')) return 'So the time is set before it matters'
  if (text.includes('call')) return 'So the answer is clear when needed'
  if (text.includes('buy') || text.includes('groceries')) return 'So it is there when needed'
  if (task.isOverdue) return "So you're not figuring it out last minute"
  return 'So this is ready when needed'
}

function buildWhy(task, context) {
  const personResult = personWhy(task, context)
  if (personResult) return personResult

  if (hasPhysicalObject(task)) {
    return environmentWhy(task)
  }

  return buildUseCaseWhy(task)
}

function finalWhy(result) {
  const limited = limitWords(result, 11)
  if (!limited || isBlocked(limited)) return null
  if (limited.split(/[.!?]/).filter(Boolean).length > 1) return null
  return limited
}

function fallbackWhy(task) {
  void task
  return 'This needs to be ready for when it comes up'
}

export function isUnsafeWhyText(text = '') {
  return isBlocked(text)
}

export function sanitizeWhyText(text = '') {
  return finalWhy(text) ?? ''
}

export function generateRelationalWhy(task, context = {}, usersById = {}, seed = 0) {
  if (!task?.title?.trim()) return ''
  void usersById
  void seed

  const learned = getLearnedWhy(task.title)
  const learnedFinal = learned && !isBlocked(learned) ? finalWhy(learned) : null
  if (learnedFinal) return learnedFinal

  const firstPass = finalWhy(buildWhy(task, context))
  if (firstPass) return firstPass

  return finalWhy(fallbackWhy(task)) ?? ''
}

export function saveWhyPattern(taskTitle, whyText) {
  const normalized = tokenize(taskTitle).join(' ')
  const validated = finalWhy(whyText)
  if (!normalized || !validated) return

  const current = getStoredPatterns()
  setStoredPatterns({
    ...current,
    [normalized]: {
      ...(current[normalized] ?? {}),
      why: validated,
      updatedAt: new Date().toISOString(),
    },
  })
}
