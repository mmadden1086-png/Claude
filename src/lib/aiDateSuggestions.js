const cache = new Map()

function cacheKey(existingTitles, preferences) {
  return JSON.stringify({ titles: existingTitles.slice().sort(), preferences })
}

export async function fetchAiDateIdeas({ existingTitles = [], preferences = {}, recentHistory = [] }, signal) {
  const key = cacheKey(existingTitles, preferences)
  if (cache.has(key)) return cache.get(key)

  try {
    const response = await fetch('/suggestDateIdeas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ existingTitles, preferences, recentHistory }),
      signal,
    })

    if (!response.ok) throw new Error(`Date idea request failed with ${response.status}`)

    const data = await response.json()
    let ideas = Array.isArray(data.ideas) ? data.ideas : []

    // normalize
    ideas = ideas.map((idea, index) => ({
      id: `ai-${index}-${Date.now()}`,
      title: typeof idea.title === 'string' ? idea.title.trim() : (idea.name || 'Date idea'),
      description: typeof idea.description === 'string' ? idea.description.trim() : '',
      category: typeof idea.category === 'string' ? idea.category.trim() : (preferences.category || 'General'),
      budgetLevel: typeof idea.budgetLevel === 'string' ? idea.budgetLevel.trim() : (preferences.budget || 'Any'),
      duration: typeof idea.duration === 'string' ? idea.duration.trim() : (preferences.duration || 'Flexible'),
      locationType: typeof idea.locationType === 'string' ? idea.locationType.trim() : 'Either',
    })).filter(i => i.title)

    // dedupe
    ideas = ideas.filter(i => !existingTitles.includes(i.title))

    // fallback
    if (!ideas.length) {
      ideas = [
        {
          id: 'fallback-1',
          title: 'Go for a walk + coffee',
          description: 'Simple reset and time together',
          category: 'Low effort',
          budgetLevel: 'Low',
          duration: 'Short',
          locationType: 'Either'
        },
        {
          id: 'fallback-2',
          title: 'Cook dinner together',
          description: 'Shared effort, easy connection',
          category: 'Home',
          budgetLevel: 'Low',
          duration: 'Medium',
          locationType: 'Home'
        },
        {
          id: 'fallback-3',
          title: 'Drive + music + talk',
          description: 'Low pressure, real conversation',
          category: 'Relaxed',
          budgetLevel: 'Low',
          duration: 'Flexible',
          locationType: 'Either'
        }
      ]
    }

    ideas = ideas.slice(0, 3)

    cache.set(key, ideas)
    return ideas

  } catch {
    console.error('AI failed, using fallback')

    return [
      {
        id: 'fallback-error-1',
        title: 'Grab food and talk',
        description: 'Keep it simple this week',
        category: 'Easy',
        budgetLevel: 'Any',
        duration: 'Short',
        locationType: 'Either'
      }
    ]
  }
}
