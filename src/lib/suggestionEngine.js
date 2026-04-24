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
  'help',
  'ready',
  'bring',
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

function shortObject(title = '') {
  const object = extractTaskObject(title)
  return object.split(/\s+/).slice(0, 4).join(' ')
}

function noteObject(notes = '') {
  const cleaned = notes.replace(/\s+/g, ' ').trim()
  if (!cleaned || isGeneric(cleaned)) return ''
  return cleaned.split(/[.!?]/)[0].split(/\s+/).slice(0, 8).join(' ')
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
  return 'They'
}

function getPersonName(task) {
  const text = `${task.title} ${task.notes}`.toLowerCase()
  if (/\bmartin'?s?\b/.test(text)) return 'Martin'
  if (/\bmegan'?s?\b/.test(text)) return 'Megan'
  if (/\bmatt'?s?\b/.test(text)) return 'Matt'
  if (/\b(he|him|his|she|her|hers|kid|child|son|daughter)\b/.test(text)) return 'They'
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
    'handled',
    'finished',
    'recorded',
    'follow-up',
    'follow up',
    'managed',
    'productivity',
    'ready and nothing is left to figure out',
    'fully taken care of',
    'nothing left to do',
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
  const object = shortObject(task.title)
  if (!object) return ''
  return `${object} is prepared and ready to use`
}

function buildDoneResult(task) {
  const context = mergedContext(task)
  const category = task.category || ''
  const objectFromNote = noteObject(task.notes)
  const title = task.title.trim()
  const titleLower = title.toLowerCase()

  if (titleLower.startsWith('help ')) {
    const personName = getPersonName(task)
    if (personName === 'Martin') return 'Martin has what he needs and is ready'
    if (personName === 'Megan') return 'Megan has what she needs and is ready'
    if (personName === 'Matt') return 'Matt has what he needs and is ready'
    return 'They have what they need and are ready'
  }

  if (context.includes('get ready')) {
    const object = shortObject(task.title.replace(/get ready/gi, ''))
    return `${object || 'Everything'} is packed and ready to use`
  }

  if (isSchoolShareContext(task)) {
    const childName = getChildName(task)
    const verb = childName === 'They' ? 'have' : 'has'
    return `${childName} ${verb} something ready to share in class`
  }

  if (context.includes('bounce house')) {
    return context.includes('shed')
      ? 'Bounce house is deflated and stored in the shed'
      : 'Bounce house is deflated and stored away'
  }

  if (/\b(put|store|stored|storing|pack|packed|packing)\b/.test(context) || context.includes('put away')) {
    const object = shortObject(task.title)
    return `${object || 'Everything'} is put away and cleared`
  }

  if (context.includes('sourdough') || context.includes('starter')) {
    return 'Sourdough starter is fed and stored properly'
  }

  if (context.includes('garage')) {
    return 'Garage is cleared and walkway is open'
  }

  if (context.includes('dog') && (context.includes('poop') || context.includes('waste'))) {
    return 'Dog waste is removed and thrown away'
  }

  if (context.includes('dog') && (context.includes('wash') || context.includes('stuff') || context.includes('bed'))) {
    return 'Dog beds and gear are washed and put away'
  }

  if (context.includes('date night')) {
    return 'Date night is chosen and time is set'
  }

  if (context.includes('appointment') || context.includes('schedule')) {
    return `${objectFromNote || shortObject(task.title) || 'Appointment'} is booked and time is set`
  }

  if (context.includes('shot') || context.includes('medicine') || context.includes('medication')) {
    return `${objectFromNote || shortObject(task.title) || 'Medicine'} is taken and supplies are put away`
  }

  if (context.includes('call')) {
    return `${shortObject(task.title) || 'Call'} is made and answer is clear`
  }

  if (context.includes('food') || context.includes('groceries') || context.includes('pet')) {
    return `${shortObject(task.title) || 'Food'} is bought and put away`
  }

  if (context.includes('buy')) {
    return `${shortObject(task.title) || 'Items'} are bought and put away`
  }

  if (context.includes('clean') || category === 'Home') {
    return `${shortObject(task.title) || 'Area'} is cleared and ready to use`
  }

  if (category === 'Health') {
    return `${shortObject(task.title) || 'Health item'} is ready and set out`
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
