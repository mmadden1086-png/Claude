import { enforceQuality, hasEnoughContent, isGeneric } from './suggestionEngine'

const WHY_STORAGE_KEY = 'follow-through-why-patterns'
const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'and', 'or', 'in', 'on', 'with', 'my'])
const OBJECT_STOP_WORDS = new Set([
  ...STOP_WORDS,
  'clean',
  'cleanup',
  'up',
  'wash',
  'make',
  'put',
  'away',
  'take',
  'get',
  'do',
  'fix',
  'plan',
  'schedule',
  'call',
  'buy',
  'review',
  'finish',
])

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
  'organized',
  'completed',
  'improves',
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

function sentenceCase(text = '') {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function extractTaskObject(title = '') {
  const cleaned = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !OBJECT_STOP_WORDS.has(token))
    .join(' ')

  return sentenceCase(cleaned || title)
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

function isSchoolShareContext(task) {
  const text = mergedContext(task)
  return (
    text.includes('show and tell') ||
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

function cleanNoteContext(notes = '') {
  const cleaned = notes.replace(/\s+/g, ' ').trim()
  if (!cleaned || isBlocked(cleaned)) return ''
  return cleaned.split(/[.!?]/)[0].split(/\s+/).slice(0, 10).join(' ')
}

function hasTaskObject(text, taskObject) {
  const objectTokens = tokenize(taskObject).filter((token) => token.length > 2)
  if (!objectTokens.length) return false
  const normalized = text.toLowerCase()
  return objectTokens.some((token) => normalized.includes(token))
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

function buildWhy(task, context) {
  const taskObject = extractTaskObject(task.title)
  const source = getTaskSource(task, context.currentUser ?? context)
  const noteContext = cleanNoteContext(task.notes)

  if (isSchoolShareContext(task)) {
    const childName = getChildName(task)
    if (childName === 'Martin') {
      return "If this isn't ready, he shows up without something to share"
    }
    return "If this isn't ready, they show up without something to share"
  }

  if (task.isOverdue) {
    return `${taskObject} already slipped - leaving it longer makes the next step heavier${noteContext ? `: ${noteContext}` : ''}`
  }

  if (source === 'requested') {
    return `${taskObject} is something they are expecting to be handled, not followed up on${noteContext ? `: ${noteContext}` : ''}`
  }

  if (source === 'anticipated') {
    return `If ${taskObject.toLowerCase()} slips, it quietly becomes something they deal with${noteContext ? `: ${noteContext}` : ''}`
  }

  return `${taskObject} does not disappear when ignored - it sits there until you deal with it${noteContext ? `: ${noteContext}` : ''}`
}

function finalWhy(result, taskObject, options = {}) {
  const { requireObject = true } = options
  const limited = limitWords(result, 30)
  if (!limited || isBlocked(limited)) return null
  if (requireObject && !hasTaskObject(limited, taskObject)) return null
  return enforceQuality(limited)
}

function fallbackWhy(task) {
  void task
  return 'This needs to be ready for when it comes up'
}

export function isUnsafeWhyText(text = '') {
  return isBlocked(text)
}

export function sanitizeWhyText(text = '') {
  return finalWhy(text, text) ?? ''
}

export function generateRelationalWhy(task, context = {}, usersById = {}, seed = 0) {
  if (!task?.title?.trim()) return ''
  void usersById
  void seed

  const taskObject = extractTaskObject(task.title)
  const learned = getLearnedWhy(task.title)
  const learnedFinal = learned && !isBlocked(learned) ? finalWhy(learned, taskObject) : null
  if (learnedFinal) return learnedFinal

  const firstPass = finalWhy(buildWhy(task, context), taskObject)
  if (firstPass) return firstPass

  return finalWhy(fallbackWhy(task), taskObject, { requireObject: false }) ?? ''
}

export function saveWhyPattern(taskTitle, whyText) {
  const normalized = tokenize(taskTitle).join(' ')
  const taskObject = extractTaskObject(taskTitle)
  const validated = finalWhy(whyText, taskObject)
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
