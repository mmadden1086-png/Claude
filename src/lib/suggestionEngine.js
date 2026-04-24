const DONE_STORAGE_KEY = 'follow-through-done-patterns'
const STOP_WORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'and', 'or', 'in', 'on', 'with', 'my'])

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeTaskInput(taskOrTitle) {
  if (typeof taskOrTitle === 'string') {
    return { title: taskOrTitle, category: '' }
  }

  return {
    title: taskOrTitle?.title ?? '',
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

function fallbackDone(title) {
  const readableTitle = title.trim()
  if (!readableTitle) return ''
  return `${readableTitle} is done and no longer needs attention`
}

export function generateDoneSuggestion(taskOrTitle) {
  const task = normalizeTaskInput(taskOrTitle)
  const title = task.title.toLowerCase()
  const category = task.category || ''

  const learned = enforceQuality(getLearnedSuggestion(task.title))
  if (learned) return learned

  let result = null

  if (category === 'Home') {
    if (title.includes('garage')) {
      result = 'Garage is fully cleared, items put away, and floor space is open'
    } else if (title.includes('dog') && (title.includes('poop') || title.includes('waste'))) {
      result = 'All waste is removed and disposed, yard is clean'
    } else if (title.includes('dog') && (title.includes('wash') || title.includes('stuff') || title.includes('bed'))) {
      result = 'Dog beds and gear are washed and put away'
    } else if (title.includes('clean')) {
      result = 'Surfaces wiped, items put away, and area is visibly clean'
    }
  }

  if (!result && category === 'Health') {
    if (title.includes('appointment') || title.includes('schedule')) {
      result = 'Appointment is booked, confirmed, and saved with details'
    } else if (title.includes('shot') || title.includes('medicine') || title.includes('medication')) {
      result = 'Medicine is taken and any follow-up is recorded'
    } else {
      result = 'Health task is completed fully with no follow-up needed'
    }
  }

  if (!result) {
    result = task.title ? `${task.title} is fully completed with no remaining steps` : ''
  }

  const final = enforceQuality(result)
  return final || fallbackDone(task.title)
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
