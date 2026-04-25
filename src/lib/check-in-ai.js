const checkInTaskCache = new Map()

function taskSummary(task) {
  return {
    id: task.id,
    title: task.title,
    assignedTo: task.assignedTo,
    requestedBy: task.requestedBy,
    category: task.category,
    effort: task.effort,
    dueDate: task.dueDate,
    reason: task._surfaceReason ?? '',
  }
}

function cacheKey(payload) {
  return JSON.stringify({
    overdue: payload.overdueTasks.map((task) => task.id ?? task.title),
    partner: payload.partnerTasks.map((task) => task.id ?? task.title),
    discussion: payload.discussionTasks.map((task) => task.id ?? task.title),
  })
}

export async function fetchCheckInTaskSuggestions({
  currentUser,
  partner,
  completedTasks = [],
  overdueTasks = [],
  partnerTasks = [],
  discussionTasks = [],
}, signal) {
  const payload = {
    currentUserName: currentUser?.name ?? 'You',
    partnerName: partner?.name ?? 'Partner',
    completedTasks: completedTasks.map(taskSummary),
    overdueTasks: overdueTasks.map(taskSummary),
    partnerTasks: partnerTasks.map(taskSummary),
    discussionTasks: discussionTasks.map(taskSummary),
  }
  const key = cacheKey(payload)

  if (checkInTaskCache.has(key)) return checkInTaskCache.get(key)
  if (!payload.overdueTasks.length && !payload.partnerTasks.length && !payload.discussionTasks.length) {
    return []
  }

  const response = await fetch('/suggestCheckInTasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Check-in suggestion request failed with ${response.status}`)
  }

  const data = await response.json()
  const suggestions = Array.isArray(data.tasks)
    ? data.tasks
        .map((task) => ({
          title: typeof task.title === 'string' ? task.title.trim() : '',
          reason: typeof task.reason === 'string' ? task.reason.trim() : '',
          assignedTo: typeof task.assignedTo === 'string' ? task.assignedTo : 'both',
          category: typeof task.category === 'string' ? task.category : 'Home',
          effort: typeof task.effort === 'string' ? task.effort : 'Quick',
          doneWhen: typeof task.doneWhen === 'string' ? task.doneWhen.trim() : '',
          why: typeof task.why === 'string' ? task.why.trim() : '',
        }))
        .filter((task) => task.title)
        .slice(0, 3)
    : []

  checkInTaskCache.set(key, suggestions)
  return suggestions
}
