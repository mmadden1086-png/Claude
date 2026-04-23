import { BOTH_ASSIGNEE_ID, getCanonicalUserName } from './constants'

const WHY_STORAGE_KEY = 'follow-through-why-patterns'
const WHY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
  'my',
  'our',
  'your',
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
  'sanctuary',
  'messy side',
  'respect the shared space',
]

const TITLE_TEMPLATES = [
  {
    matches: ['clean', 'kitchen'],
    self: ['Keeps the kitchen usable this week', 'Prevents cleanup from piling up later'],
    requestedFromPartner: (name) => [`Takes this off ${name}'s mental load`, 'Keeps the space comfortable for both'],
    assignedToPartner: ['Keeps responsibilities balanced between you', 'Reduces follow-up later'],
  },
  {
    matches: ['schedule', 'dentist'],
    self: ['Prevents this from becoming a bigger task later', 'Keeps health planning on track'],
    requestedFromPartner: (name) => [`Takes this off ${name}'s mental load`, 'Reduces follow-up later'],
    assignedToPartner: ['Keeps responsibilities balanced between you', 'Makes timing clearer for both of you'],
  },
  {
    matches: ['fix', 'faucet'],
    self: ['Prevents this from becoming a bigger task later', 'Keeps the space working normally'],
    requestedFromPartner: (name) => [`Takes this off ${name}'s mental load`, 'Keeps the area usable for both'],
    assignedToPartner: ['Keeps responsibilities balanced between you', 'Prevents this from slipping further'],
  },
  {
    matches: ['plan', 'date', 'night'],
    self: ['Keeps things running smoothly this week', 'Makes shared planning feel lighter'],
    requestedFromPartner: (name) => [`Takes this off ${name}'s mental load`, 'Keeps shared time easier to plan'],
    assignedToPartner: ['Keeps responsibilities balanced between you', 'Makes sure plans stay clear'],
  },
  {
    matches: ['clean', 'dog', 'poop'],
    self: ['Keeps cleanup from building up later', 'Keeps the yard usable this week'],
    requestedFromPartner: (name) => [`Helps ${name} feel better about the space`, 'Keeps shared space comfortable'],
    assignedToPartner: ['Keeps responsibilities balanced between you', 'Makes sure this does not get missed'],
  },
]

const CATEGORY_SELF = {
  Relationship: ['Keeps things running smoothly this week', 'Prevents this from slipping later'],
  Home: ['Prevents this from becoming a bigger task later', 'Keeps the space usable this week'],
  Health: ['Keeps health tasks moving this week', 'Prevents this from getting missed later'],
  Admin: ['Keeps things running smoothly this week', 'Prevents this from getting missed'],
  Finance: ['Keeps planning clearer this week', 'Prevents follow-up later'],
  Money: ['Keeps planning clearer this week', 'Prevents follow-up later'],
}

const CATEGORY_REQUESTED_FROM_PARTNER = {
  Relationship: (name) => [`Helps ${name} feel better about shared plans`, 'Keeps responsibilities balanced'],
  Home: (name) => [`Helps ${name} feel better about the shared space`, 'Keeps shared space comfortable'],
  Health: (name) => [`Takes this off ${name}'s mental load`, 'Reduces follow-up later'],
  Admin: (name) => [`Takes this off ${name}'s mental load`, 'Makes the next step clearer'],
  Finance: (name) => [`Takes this off ${name}'s mental load`, 'Keeps shared planning clearer'],
  Money: (name) => [`Takes this off ${name}'s mental load`, 'Keeps shared planning clearer'],
}

const CATEGORY_ASSIGNED_TO_PARTNER = {
  Relationship: ['Keeps responsibilities balanced between you', 'Makes sure this does not get missed'],
  Home: ['Keeps responsibilities balanced between you', 'Keeps shared space comfortable'],
  Health: ['Keeps responsibilities balanced between you', 'Makes sure this stays on track'],
  Admin: ['Keeps responsibilities balanced between you', 'Makes sure this does not get missed'],
  Finance: ['Keeps responsibilities balanced between you', 'Keeps planning clearer for both'],
  Money: ['Keeps responsibilities balanced between you', 'Keeps planning clearer for both'],
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function tokenize(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !WHY_STOP_WORDS.has(token))
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

function splitLines(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
}

function isBlocked(text) {
  const normalized = text.toLowerCase()
  return BLOCKED_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function isUnsafeWhyText(text = '') {
  return isBlocked(text)
}

export function sanitizeWhyText(text = '') {
  const lines = splitLines(text)
  if (!lines.length || lines.some(isBlocked)) return ''
  return finalizeLines(lines, ['Keeps things moving forward', 'Prevents this from getting missed'])
}

function trimLine(line) {
  const words = line.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 12) return words.join(' ')
  return words.slice(0, 12).join(' ')
}

function ensureLineLength(line) {
  const words = trimLine(line).split(/\s+/).filter(Boolean)
  if (words.length >= 6 && words.length <= 12) return words.join(' ')
  return ''
}

function validateLines(lines) {
  if (!lines.length || lines.length > 2) return false
  return lines.every((line) => {
    if (!line || isBlocked(line)) return false
    return Boolean(ensureLineLength(line))
  })
}

function finalizeLines(lines, fallbackLines) {
  const candidateLines = lines.map(ensureLineLength).filter(Boolean).slice(0, 2)
  if (validateLines(candidateLines)) return candidateLines.join('\n')

  const safeFallback = fallbackLines.map(ensureLineLength).filter(Boolean).slice(0, 2)
  if (validateLines(safeFallback)) return safeFallback.join('\n')

  return 'Keeps things moving forward\nPrevents this from getting missed'
}

function getRelationshipCase(task, currentUser) {
  const requestedBy = task.requestedBy ?? task.createdBy ?? currentUser?.id ?? null
  const assignedTo = task.assignedTo ?? currentUser?.id ?? null

  if (!requestedBy || assignedTo === requestedBy || assignedTo === BOTH_ASSIGNEE_ID) return 'self'
  if (assignedTo === currentUser?.id) return 'requested-from-partner'
  return 'assigned-to-partner'
}

function getDisplayName(userId, usersById = {}) {
  const matched = usersById[userId]
  return getCanonicalUserName(matched?.email, matched?.name ?? 'Partner')
}

function getTitleTemplate(tokens) {
  return TITLE_TEMPLATES.find((template) => template.matches.every((token) => tokens.includes(token))) ?? null
}

function getCategoryFallback(caseType, category, partnerName) {
  if (caseType === 'self') {
    return CATEGORY_SELF[category] ?? ['Keeps things running smoothly this week', 'Prevents this from piling up later']
  }

  if (caseType === 'requested-from-partner') {
    return CATEGORY_REQUESTED_FROM_PARTNER[category]?.(partnerName)
      ?? [`Takes this off ${partnerName}'s mental load`, 'Reduces follow-up later']
  }

  return CATEGORY_ASSIGNED_TO_PARTNER[category] ?? ['Keeps responsibilities balanced between you', 'Makes sure this does not get missed']
}

function getVagueFallback(caseType, partnerName) {
  if (caseType === 'self') {
    return ['Keeps things moving forward this week', 'Prevents this from getting missed later']
  }

  if (caseType === 'requested-from-partner') {
    return [`Takes this off ${partnerName}'s mental load`, 'Keeps things moving forward']
  }

  return ['Keeps responsibilities balanced between you', 'Makes sure this does not get missed']
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

export function generateRelationalWhy(task, currentUser, usersById = {}, seed = 0) {
  if (!task?.title?.trim()) return ''

  const learned = getLearnedWhy(task.title)
  if (learned) {
    return finalizeLines(splitLines(learned), ['Keeps things moving forward', 'Prevents this from getting missed'])
  }

  const tokens = tokenize(task.title)
  const caseType = getRelationshipCase(task, currentUser)
  const requesterId = task.requestedBy ?? task.createdBy ?? currentUser?.id ?? null
  const partnerName = requesterId && requesterId !== currentUser?.id ? getDisplayName(requesterId, usersById) : 'your partner'
  const template = getTitleTemplate(tokens)

  let candidateLines
  if (!tokens.length || tokens.some((token) => ['stuff', 'things', 'misc'].includes(token))) {
    candidateLines = getVagueFallback(caseType, partnerName)
  } else if (template) {
    if (caseType === 'self') candidateLines = template.self
    else if (caseType === 'requested-from-partner') candidateLines = template.requestedFromPartner(partnerName)
    else candidateLines = template.assignedToPartner
  } else {
    candidateLines = getCategoryFallback(caseType, task.category, partnerName)
  }

  const rotatedLines = seed % 2 === 1 ? [...candidateLines].reverse() : candidateLines
  return finalizeLines(rotatedLines, getCategoryFallback(caseType, task.category, partnerName))
}

export function saveWhyPattern(taskTitle, whyText) {
  const normalized = tokenize(taskTitle).join(' ')
  const validated = finalizeLines(splitLines(whyText), ['Keeps things moving forward', 'Prevents this from getting missed'])
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
