export async function fetchTaskBreakdown({ title, notes = '', clarity = '' }, signal) {
  const response = await fetch('/suggestTaskBreakdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, notes, clarity }),
    signal,
  })

  if (!response.ok) throw new Error(`Breakdown request failed with ${response.status}`)

  const data = await response.json()
  return Array.isArray(data.steps)
    ? data.steps
        .map((step) => ({
          title: typeof step.title === 'string' ? step.title.trim() : '',
          effort: ['Quick', 'Medium', 'Heavy'].includes(step.effort) ? step.effort : 'Quick',
          doneWhen: typeof step.doneWhen === 'string' ? step.doneWhen.trim() : '',
        }))
        .filter((step) => step.title)
    : []
}
