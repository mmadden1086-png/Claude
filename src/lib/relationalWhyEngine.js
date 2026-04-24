import { enforceQuality, hasEnoughContent, isGeneric } from './suggestionEngine'

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
  return BLOCKED_PATTERNS.some((pattern) => normalized.includes(pattern))
}

function limitWords(text = '', maxWords = 28) {
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
  if (!cleaned || isBlocked(cleaned) || isGeneric(cleaned)) return ''
  return limitWords(cleaned, 12)
}

function addNoteContext(result, notes) {
  const noteContext = cleanNoteContext(notes)
  if (!noteContext) return result
  return limitWords(`${result} ${noteContext}`, 28)
}

function finalWhy(result) {
  if (!result || isBlocked(result)) return 'Clears this off your plate and prevents it from lingering'

  const final = enforceQuality(limitWords(result, 28))
  if (!final || isBlocked(final)) return 'Clears this off your plate and prevents it from lingering'
  return final
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

export function isUnsafeWhyText(text = '') {
  return isBlocked(text)
}

export function sanitizeWhyText(text = '') {
  return finalWhy(text)
}

export function generateRelationalWhy(task, context = {}, usersById = {}, seed = 0) {
  if (!task?.title?.trim()) return ''
  void usersById

  const learned = getLearnedWhy(task.title)
  if (learned && !isBlocked(learned)) return finalWhy(learned)

  const title = task.title.toLowerCase()
  const category = task.category || ''
  const requestedBy = task.requestedBy || task.createdBy || null
  const currentUserId = getCurrentUserId(context)
  const isPartner = Boolean(requestedBy && requestedBy !== currentUserId)

  let result = null

  if (isPartner) {
    result = 'This removes mental load from them and keeps the space shared, not one-sided'
  }

  if (!result && category === 'Home') {
    if (title.includes('garage')) {
      result = 'The garage is your domain - keeping it handled prevents buildup and long-term stress'
    } else if (title.includes('clean')) {
      result = 'Prevents clutter from building up and keeps the space usable day to day'
    } else {
      result = 'Keeps your environment under control and prevents things from piling up later'
    }
  }

  if (!result && category === 'Health') {
    result = 'Supports your baseline health and prevents small issues from becoming bigger ones'
  }

  if (!result && task.isOverdue) {
    result = 'This has been sitting - finishing it clears mental drag and resets momentum'
  }

  if (!result && !hasEnoughContent(task.title)) {
    result = 'Finishing the first clear step prevents this from dragging further'
  }

  if (!result) {
    result = 'Finishing this removes it from your mental load and prevents it from dragging further'
  }

  const rotated = seed % 2 === 1 && category === 'Home' && !isPartner
    ? result.replace('prevents', 'avoids')
    : result

  return finalWhy(addNoteContext(rotated, task.notes))
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
