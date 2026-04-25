const suggestionCache = new Map()

function cacheKey(title = '') {
  return title.trim().toLowerCase()
}

export async function fetchAiTaskSuggestion({ title, assignedTo = '', requestedBy = null }, signal) {
  const normalizedTitle = title.trim()
  if (normalizedTitle.length < 3) return null

  const key = cacheKey(normalizedTitle)
  if (suggestionCache.has(key)) return suggestionCache.get(key)

  const response = await fetch('/suggestTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: normalizedTitle,
      assignedTo,
      requestedBy,
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Suggestion request failed with ${response.status}`)
  }

  const data = await response.json()
  const suggestion = {
    doneWhen: typeof data.doneWhen === 'string' ? data.doneWhen.trim() : '',
    why: typeof data.why === 'string' ? data.why.trim() : '',
  }

  if (!suggestion.doneWhen && !suggestion.why) {
    throw new Error('Suggestion response was empty.')
  }

  suggestionCache.set(key, suggestion)
  return suggestion
}
