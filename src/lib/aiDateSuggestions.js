const cache = new Map()

function cacheKey(existingTitles, preferences) {
  return JSON.stringify({ titles: existingTitles.slice().sort(), preferences })
}

export async function fetchAiDateIdeas({ existingTitles = [], preferences = {}, recentHistory = [] }, signal) {
  const key = cacheKey(existingTitles, preferences)
  if (cache.has(key)) return cache.get(key)

  const response = await fetch('/suggestDateIdeas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ existingTitles, preferences, recentHistory }),
    signal,
  })

  if (!response.ok) throw new Error(`Date idea request failed with ${response.status}`)

  const data = await response.json()
  const ideas = Array.isArray(data.ideas)
    ? data.ideas
        .map((idea) => ({
          title: typeof idea.title === 'string' ? idea.title.trim() : '',
          description: typeof idea.description === 'string' ? idea.description.trim() : '',
          category: typeof idea.category === 'string' ? idea.category.trim() : 'Outing',
          budgetLevel: typeof idea.budgetLevel === 'string' ? idea.budgetLevel.trim() : 'Low',
          duration: typeof idea.duration === 'string' ? idea.duration.trim() : '1-2 hours',
          locationType: typeof idea.locationType === 'string' ? idea.locationType.trim() : 'Either',
        }))
        .filter((idea) => idea.title)
    : []

  cache.set(key, ideas)
  return ideas
}
