const DONE_STORAGE_KEY = 'follow-through-done-patterns'
const DONE_STOP_WORDS = new Set([
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

const DONE_RULES = [
  { matches: ['make', 'snacks'], suggestion: 'Snacks prepared and ready to serve' },
  { matches: ['clean', 'dog', 'poop'], suggestion: 'All waste removed and disposed properly' },
  { matches: ['wash', 'dog', 'stuff'], suggestion: 'Dog beds and gear washed and put away' },
  { matches: ['schedule', 'dentist'], suggestion: 'Appointment booked and confirmed with date saved' },
  { matches: ['clean', 'kitchen'], suggestion: 'Counters clear, dishes done, sink wiped clean' },
  { matches: ['call', 'insurance'], suggestion: 'Agent reached and claim status clearly confirmed' },
  { matches: ['buy', 'groceries'], suggestion: 'Groceries purchased and put away properly' },
  { matches: ['fix', 'faucet'], suggestion: 'Leak stopped and faucet working normally' },
  { matches: ['plan', 'date', 'night'], suggestion: 'Reservation booked and plans confirmed' },
  { matches: ['pick', 'up', 'medications'], suggestion: 'Medications picked up and brought home' },
  { matches: ['clean', 'jacuzzi'], suggestion: 'Jacuzzi cleaned and ready to use' },
  { matches: ['put', 'away'], suggestion: 'Items put away and out of sight' },
  { matches: ['review', 'budget'], suggestion: 'Budget reviewed and next steps agreed' },
  { matches: ['schedule'], suggestion: 'Appointment booked and date saved' },
  { matches: ['clean'], suggestion: 'Area cleaned and reset for use' },
  { matches: ['call'], suggestion: 'Call completed and outcome clearly noted' },
  { matches: ['buy'], suggestion: 'Items purchased and put away' },
  { matches: ['pick', 'up'], suggestion: 'Item picked up and brought home' },
  { matches: ['pay'], suggestion: 'Payment submitted and confirmation received' },
  { matches: ['email'], suggestion: 'Email sent and response handled' },
  { matches: ['fix'], suggestion: 'Issue fixed and working properly' },
]

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeTaskTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !DONE_STOP_WORDS.has(token))
}

function getStoredPatterns() {
  if (!canUseStorage()) return {}

  try {
    const raw = window.localStorage.getItem(DONE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setStoredPatterns(patterns) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(patterns))
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

function getLearnedSuggestion(taskTitle) {
  const titleTokens = normalizeTaskTitle(taskTitle)
  if (!titleTokens.length) return ''

  const patterns = getStoredPatterns()
  const normalized = titleTokens.join(' ')
  if (patterns[normalized]?.done) return patterns[normalized].done

  let bestSuggestion = ''
  let bestScore = 0

  Object.entries(patterns).forEach(([key, value]) => {
    if (!value?.done) return
    const score = scoreTokenMatch(titleTokens, key.split(' '))
    if (score > bestScore) {
      bestScore = score
      bestSuggestion = value.done
    }
  })

  return bestScore >= 0.6 ? bestSuggestion : ''
}

function limitWords(text, maxWords = 12) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, maxWords).join(' ')
}

function hasValidDoneShape(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length < 5 || words.length > 12) return false
  return /(ed|ready|clear|clean|saved|confirmed|received|removed|put|working|reviewed|prepared|disposed)$/i.test(words.at(-1)) || / and /i.test(text)
}

function sanitizeDoneSuggestion(text) {
  if (!text) return ''
  if (/\b(helps|because|so that)\b/i.test(text)) return ''
  const trimmed = limitWords(text.replace(/\s+/g, ' '))
  return hasValidDoneShape(trimmed) ? trimmed : ''
}

function buildFallback(tokens) {
  if (!tokens.length) return ''
  if (tokens.includes('clean')) return 'Area cleaned and ready to use'
  if (tokens.includes('wash')) return 'Items washed and put away'
  if (tokens.includes('plan')) return 'Plan confirmed and details recorded'
  if (tokens.includes('schedule')) return 'Appointment booked and date saved'
  if (tokens.includes('fix')) return 'Issue fixed and working properly'
  return ''
}

export function generateDoneSuggestion(taskTitle) {
  const learned = sanitizeDoneSuggestion(getLearnedSuggestion(taskTitle))
  if (learned) return learned

  const tokens = normalizeTaskTitle(taskTitle)
  if (!tokens.length) return ''

  const matchedRule = DONE_RULES.find((rule) => rule.matches.every((token) => tokens.includes(token)))
  return sanitizeDoneSuggestion(matchedRule?.suggestion) || buildFallback(tokens)
}

export function saveDonePattern(taskTitle, doneText) {
  const normalized = normalizeTaskTitle(taskTitle).join(' ')
  const sanitized = sanitizeDoneSuggestion(doneText)
  if (!normalized || !sanitized) return

  const current = getStoredPatterns()
  setStoredPatterns({
    ...current,
    [normalized]: {
      ...(current[normalized] ?? {}),
      done: sanitized,
      updatedAt: new Date().toISOString(),
    },
  })
}
