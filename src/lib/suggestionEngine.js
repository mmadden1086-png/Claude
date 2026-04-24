const DONE_STORAGE_KEY = 'follow-through-done-patterns'
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

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeTaskInput(taskOrTitle) {
  if (typeof taskOrTitle === 'string') {
    return { title: taskOrTitle, notes: '', category: '' }
  }

  return {
    title: taskOrTitle?.title ?? '',
    notes: taskOrTitle?.notes ?? '',
    category: taskOrTitle?.category ?? '',
  }
}

function normalizeTaskTitle(title = '') {
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

function noteObject(notes = '') {
  const cleaned = notes.replace(/\s+/g, ' ').trim()
  if (!cleaned || isGeneric(cleaned)) return ''
  return cleaned.split(/[.!?]/)[0].split(/\s+/).slice(0, 8).join(' ')
}

export function hasEnoughContent(text) {
  if (!text) return false
  const cleaned = text
    .toLowerCase()
    .replace(/\b(a|an|the|to|for|of|and|or|in|on|with|my)\b/g, '')
    .trim()
  return cleaned.split(' ').filter(Boolean).length >= 3
}

export function isGeneric(text) {
  if (!text) return true

  const banned = [
    'improves',
    'helps',
    'makes it better',
    'things are better',
    'task is done',
    'task is completed',
    'completed',
    'done',
    'stay organized',
    'keep things clean',
    'more organized',
  ]

  return banned.some((phrase) => text.toLowerCase().includes(phrase))
}

export function enforceQuality(text) {
  if (!text) return null
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (isGeneric(cleaned)) return null
  if (cleaned.split(' ').filter(Boolean).length < 6) return null
  return cleaned
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

function buildFallback(task) {
  const object = extractTaskObject(task.title)
  if (!object) return ''
  return `${object} is cleared, reset, and ready with nothing left loose`
}

function buildDoneResult(task) {
  const title = task.title.toLowerCase()
  const category = task.category || ''
  const objectFromNote = noteObject(task.notes)

  if (title.includes('bounce house')) {
    return 'Bounce house is deflated, folded, and stored with nothing left outside'
  }

  if (title.includes('sourdough') || title.includes('starter')) {
    return 'Sourdough starter is fed, labeled, and stored at the right temperature'
  }

  if (title.includes('garage')) {
    return 'Garage floor is open, items are put away, and walkway is clear'
  }

  if (title.includes('dog') && (title.includes('poop') || title.includes('waste'))) {
    return 'Dog waste is removed, bagged, and disposed with yard clear'
  }

  if (title.includes('dog') && (title.includes('wash') || title.includes('stuff') || title.includes('bed'))) {
    return 'Dog beds and gear are washed, dried, and put away'
  }

  if (title.includes('date night')) {
    return 'Date night is chosen, time is set, and details are saved'
  }

  if (title.includes('appointment') || title.includes('schedule')) {
    return `${objectFromNote || extractTaskObject(task.title) || 'Appointment'} is booked, confirmed, and saved with date and time`
  }

  if (title.includes('shot') || title.includes('medicine') || title.includes('medication')) {
    return `${objectFromNote || extractTaskObject(task.title) || 'Medicine'} is taken, logged, and supplies are put away`
  }

  if (title.includes('call')) {
    return `${extractTaskObject(task.title) || 'Call'} is made, outcome is noted, and next step is clear`
  }

  if (title.includes('buy') || title.includes('groceries')) {
    return `${extractTaskObject(task.title) || 'Items'} are purchased, checked, and put away`
  }

  if (title.includes('clean') || category === 'Home') {
    return `${extractTaskObject(task.title) || 'Area'} is cleared, wiped, and ready to use`
  }

  if (category === 'Health') {
    return `${extractTaskObject(task.title) || 'Health item'} is handled, recorded, and follow-up is clear`
  }

  return buildFallback(task)
}

export function generateDoneSuggestion(taskOrTitle) {
  const task = normalizeTaskInput(taskOrTitle)
  const learned = enforceQuality(getLearnedSuggestion(task.title))
  if (learned) return learned

  const result = buildDoneResult(task)
  const final = enforceQuality(result)
  if (final) return final

  const fallback = buildFallback(task)
  return enforceQuality(fallback) || ''
}

export function saveDonePattern(taskTitle, doneText) {
  const normalized = normalizeTaskTitle(taskTitle).join(' ')
  const sanitized = enforceQuality(doneText)
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
