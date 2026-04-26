/* global process */
import admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import OpenAI from 'openai'

admin.initializeApp()

const db = admin.firestore()
const messaging = admin.messaging()
const POINTS_BY_EFFORT = {
  Quick: 1,
  Medium: 2,
  Heavy: 3,
}

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function normalizeTaskTitle(title = 'Task') {
  return String(title || 'Task').trim().replace(/\s+/g, ' ')
}

function classifyTaskIntent(title = '') {
  const normalized = title.toLowerCase()
  if (/\b(call|text|email|message|ask|reply)\b/.test(normalized)) return 'communication'
  if (/\b(schedule|book|plan|reserve|set up)\b/.test(normalized)) return 'planning'
  if (/\b(pay|budget|bill|invoice|money)\b/.test(normalized)) return 'money'
  if (/\b(clean|wash|fold|trash|dishes|laundry|organize)\b/.test(normalized)) return 'home'
  if (/\b(buy|pick up|get|order)\b/.test(normalized)) return 'errand'
  if (/\b(fix|repair|replace|install|build)\b/.test(normalized)) return 'repair'
  return 'general'
}

function fallbackSuggestion(title = 'Task') {
  const taskTitle = normalizeTaskTitle(title)
  const intent = classifyTaskIntent(taskTitle)

  if (intent === 'communication') {
    return {
      doneWhen: `The message about ${taskTitle} has been sent and any next step is clear`,
      why: "So nobody is left waiting or guessing",
    }
  }

  if (intent === 'planning') {
    return {
      doneWhen: `${taskTitle} has a clear date, time, or next step`,
      why: "So the plan does not stay vague",
    }
  }

  if (intent === 'money') {
    return {
      doneWhen: `${taskTitle} is paid, reviewed, or ready for the next step`,
      why: "So money does not become a surprise later",
    }
  }

  if (intent === 'home') {
    return {
      doneWhen: `${taskTitle} is done enough that the space feels reset`,
      why: "So it stops adding background stress",
    }
  }

  if (intent === 'errand') {
    return {
      doneWhen: `${taskTitle} is picked up, ordered, or no longer needed`,
      why: "So it is not sitting on the mental list anymore",
    }
  }

  if (intent === 'repair') {
    return {
      doneWhen: `${taskTitle} is working or the next repair step is clear`,
      why: "So the problem does not keep lingering",
    }
  }

  return {
    doneWhen: `${taskTitle} has a clear finish point or next step`,
    why: "So it does not stay half-open in your head",
  }
}

function cleanSuggestionText(value = '') {
  return String(value || '')
    .replace(/^[-•\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSuggestionContent(content, title) {
  try {
    const parsed = JSON.parse(content)
    const doneWhen = cleanSuggestionText(parsed.doneWhen)
    const why = cleanSuggestionText(parsed.why)

    if (!doneWhen || !why) return fallbackSuggestion(title)
    return { doneWhen, why }
  } catch (error) {
    console.error('Could not parse OpenAI suggestion JSON.', error)
    return fallbackSuggestion(title)
  }
}

function fallbackAccountabilityMessage(condition = {}) {
  if (condition.type === 'check_in_ignored') return "You haven't talked through things in over a week"
  if (condition.type === 'check_in_missed') return "You haven't talked through things this week"
  if (condition.type === 'date_night_missed') return "You didn't make time together this month"
  if (condition.type === 'partner_tasks_escalated') return 'A few things she added have not been touched yet'
  if (condition.type === 'partner_tasks_flagged') return 'A few partner asks need a first step'
  return 'Something needs a little attention today'
}

function parseAccountabilityContent(content, condition) {
  try {
    const parsed = JSON.parse(content)
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : ''
    return message || fallbackAccountabilityMessage(condition)
  } catch (error) {
    console.error('Could not parse OpenAI accountability JSON.', error)
    return fallbackAccountabilityMessage(condition)
  }
}

function fallbackCheckInTasks(payload = {}) {
  const sourceTasks = [
    ...(Array.isArray(payload.overdueTasks) ? payload.overdueTasks : []),
    ...(Array.isArray(payload.partnerTasks) ? payload.partnerTasks : []),
    ...(Array.isArray(payload.discussionTasks) ? payload.discussionTasks : []),
  ]
  const seen = new Set()

  return sourceTasks
    .filter((task) => task?.title && !seen.has(task.title.toLowerCase()) && seen.add(task.title.toLowerCase()))
    .slice(0, 3)
    .map((task) => ({
      title: `Decide next step for ${task.title}`,
      reason: 'Keeps this from staying unresolved after the check-in',
      assignedTo: task.assignedTo || 'both',
      category: task.category || 'Home',
      effort: 'Quick',
      doneWhen: `Next step for ${task.title} is clear`,
      why: 'So it has a clear path forward',
    }))
}

function parseCheckInTasksContent(content, payload) {
  try {
    const parsed = JSON.parse(content)
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : []
    const cleaned = tasks
      .map((task) => ({
        title: typeof task.title === 'string' ? task.title.trim() : '',
        reason: typeof task.reason === 'string' ? task.reason.trim() : '',
        assignedTo: typeof task.assignedTo === 'string' ? task.assignedTo.trim() : 'both',
        category: typeof task.category === 'string' ? task.category.trim() : 'Home',
        effort: typeof task.effort === 'string' ? task.effort.trim() : 'Quick',
        doneWhen: typeof task.doneWhen === 'string' ? task.doneWhen.trim() : '',
        why: typeof task.why === 'string' ? task.why.trim() : '',
      }))
      .filter((task) => task.title)
      .slice(0, 3)

    return cleaned.length ? cleaned : fallbackCheckInTasks(payload)
  } catch (error) {
    console.error('Could not parse OpenAI check-in task JSON.', error)
    return fallbackCheckInTasks(payload)
  }
}

async function sendToUser(userId, title, body, data = {}) {
  if (!userId) return
  const userSnapshot = await db.collection('users').doc(userId).get()
  const user = userSnapshot.data()
  if (!user?.pushToken) {
    console.info(`Skipping notification for ${userId}: no push token saved.`)
    return
  }

  try {
    const response = await messaging.send({
      token: user.pushToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
    })

    console.info(`Notification sent to ${userId}`, { messageId: response, kind: data.kind ?? 'generic' })
  } catch (error) {
    console.error(`Notification send failed for ${userId}`, error)

    if (INVALID_TOKEN_ERRORS.has(error?.code)) {
      await db.collection('users').doc(userId).set(
        {
          pushToken: admin.firestore.FieldValue.delete(),
        },
        { merge: true },
      )
    }

    throw error
  }
}

async function sendToToken(token, title, body, data = {}) {
  if (!token) {
    throw new HttpsError('failed-precondition', 'No push token was provided.')
  }

  return messaging.send({
    token,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
  })
}

export const suggestTask = onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  if (request.method !== 'POST') {
    response.set('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
  const assignedTo = typeof request.body?.assignedTo === 'string' ? request.body.assignedTo.trim() : ''
  const requestedBy =
    typeof request.body?.requestedBy === 'string' ? request.body.requestedBy.trim() : request.body?.requestedBy ?? null
  const category = typeof request.body?.category === 'string' ? request.body.category.trim() : ''
  const effort = typeof request.body?.effort === 'string' ? request.body.effort.trim() : ''
  const notes = typeof request.body?.notes === 'string' ? request.body.notes.trim().slice(0, 300) : ''

  if (!title) {
    response.status(400).json({ error: 'A task title is required.' })
    return
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured.')
    }

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 140,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You improve task clarity for a mobile-first household follow-through app.

The user may only give a short title. Infer a practical finish line, but do not invent private details.

Write two fields:
1. doneWhen: a concrete, observable finish line.
2. why: the real-life reason this matters.

Rules:
- Be specific to the task title.
- Sound human, not like a productivity app.
- Keep each field under 110 characters.
- No guilt, shame, therapy language, or corporate wording.
- Do not say completed, handled, managed, optimized, efficient, productivity, accountability, system, workflow, leverage, or follow-up.
- Do not repeat the task title word-for-word unless needed for clarity.
- If the task is vague, make the next visible step clear.
- If it involves another person, focus on reducing waiting, confusion, or friction.
- If it is a home task, focus on reducing background stress.
- If it is planning, focus on date/time/decision clarity.

Return strict JSON only:
{
  "doneWhen": string,
  "why": string
}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            title,
            assignedTo: assignedTo || 'unknown',
            requestedBy: requestedBy || 'none',
            category: category || 'unknown',
            effort: effort || 'unknown',
            notes: notes || '',
          }),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    response.status(200).json(parseSuggestionContent(content, title))
  } catch (error) {
    console.error('OpenAI task suggestion failed.', error)
    response.status(200).json(fallbackSuggestion(title))
  }
})

export const suggestAccountability = onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  if (request.method !== 'POST') {
    response.set('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const condition = {
    type: typeof request.body?.type === 'string' ? request.body.type : '',
    label: typeof request.body?.label === 'string' ? request.body.label : '',
    days: Number(request.body?.days ?? 0),
    count: Number(request.body?.count ?? 0),
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured.')
    }

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.25,
      max_tokens: 60,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You write one short relationship-aware app insight.

Be calm, practical, and human.

Rules:
- Under 12 words.
- No guilt or shame.
- No system language.
- No therapy language.
- No exaggeration.
- Make it sound like a helpful nudge, not an alert.

Return JSON with:
message`,
        },
        {
          role: 'user',
          content: `Condition: ${condition.label || condition.type}
Days: ${condition.days}
Count: ${condition.count}`,
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    response.status(200).json({ message: parseAccountabilityContent(content, condition) })
  } catch (error) {
    console.error('OpenAI accountability message failed.', error)
    response.status(200).json({ message: fallbackAccountabilityMessage(condition) })
  }
})

export const suggestCheckInTasks = onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  if (request.method !== 'POST') {
    response.set('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const payload = {
    currentUserName: typeof request.body?.currentUserName === 'string' ? request.body.currentUserName : 'You',
    partnerName: typeof request.body?.partnerName === 'string' ? request.body.partnerName : 'Partner',
    completedTasks: Array.isArray(request.body?.completedTasks) ? request.body.completedTasks.slice(0, 5) : [],
    overdueTasks: Array.isArray(request.body?.overdueTasks) ? request.body.overdueTasks.slice(0, 5) : [],
    partnerTasks: Array.isArray(request.body?.partnerTasks) ? request.body.partnerTasks.slice(0, 5) : [],
    discussionTasks: Array.isArray(request.body?.discussionTasks) ? request.body.discussionTasks.slice(0, 5) : [],
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured.')
    }

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.25,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You suggest concrete follow-through tasks after a weekly partner check-in.

Rules:
- Return 1 to 3 tasks max.
- Make each task a small next action, not a summary.
- Prefer the smallest useful action.
- Keep titles short and real-world.
- Use neutral language.
- Do not use guilt, blame, productivity language, or system language.
- Prefer tasks that resolve overdue, partner-requested, or discussion items.
- Do not create big vague tasks like "Improve communication".
- Each doneWhen must make the finish line obvious.
- Each why must explain the real-world impact.

Return JSON:
{
  "tasks": [
    {
      "title": string,
      "reason": string,
      "assignedTo": "both" | "currentUser" | "partner",
      "category": "Home" | "Kids" | "Money" | "Relationship" | "Health" | "Errands",
      "effort": "Quick" | "Medium" | "Heavy",
      "doneWhen": string,
      "why": string
    }
  ]
}`,
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    response.status(200).json({ tasks: parseCheckInTasksContent(content, payload) })
  } catch (error) {
    console.error('OpenAI check-in task suggestions failed.', error)
    response.status(200).json({ tasks: fallbackCheckInTasks(payload) })
  }
})

export const suggestDateIdeas = onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  if (request.method !== 'POST') {
    response.set('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const existingTitles = Array.isArray(request.body?.existingTitles) ? request.body.existingTitles.slice(0, 20) : []
  const preferences = {
    budget: typeof request.body?.preferences?.budget === 'string' ? request.body.preferences.budget : 'Any',
    duration: typeof request.body?.preferences?.duration === 'string' ? request.body.preferences.duration : 'Any',
    category: typeof request.body?.preferences?.category === 'string' ? request.body.preferences.category : 'Any',
  }
  const recentHistory = Array.isArray(request.body?.recentHistory) ? request.body.recentHistory.slice(0, 5) : []

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.85,
      max_tokens: 450,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You suggest fresh date night ideas for couples.

Rules:
- Return exactly 3 ideas the couple hasn't tried yet.
- Each idea should be practical and specific — not vague.
- Keep titles short (3-6 words).
- Descriptions: 1 sentence, real and grounded.
- Match budget/duration/category preferences if given (not "Any").
- Avoid repeating any title from the existing list.
- No therapy language, grand declarations, or filler.
- Sound like a friend who knows them well, not a planning app.

Categories: "At home" | "Outing" | "Food" | "Creative" | "Adventure" | "Relaxing"
Budget: "Free" | "Low" | "Medium" | "High"
Duration: "30-60 min" | "1-2 hours" | "2-4 hours" | "Half day"
Location: "Home" | "Out" | "Either"

Return strict JSON:
{
  "ideas": [
    { "title": string, "description": string, "category": string, "budgetLevel": string, "duration": string, "locationType": string }
  ]
}`,
        },
        {
          role: 'user',
          content: JSON.stringify({ existingIdeas: existingTitles, preferences, recentHistory }),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    try {
      const parsed = JSON.parse(content)
      const ideas = Array.isArray(parsed.ideas)
        ? parsed.ideas
            .map((idea) => ({
              title: typeof idea.title === 'string' ? idea.title.trim() : '',
              description: typeof idea.description === 'string' ? idea.description.trim() : '',
              category: typeof idea.category === 'string' ? idea.category.trim() : 'Outing',
              budgetLevel: typeof idea.budgetLevel === 'string' ? idea.budgetLevel.trim() : 'Low',
              duration: typeof idea.duration === 'string' ? idea.duration.trim() : '1-2 hours',
              locationType: typeof idea.locationType === 'string' ? idea.locationType.trim() : 'Either',
            }))
            .filter((idea) => idea.title)
            .slice(0, 3)
        : []
      response.status(200).json({ ideas })
    } catch {
      response.status(200).json({ ideas: [] })
    }
  } catch (error) {
    console.error('Date idea suggestion failed.', error)
    response.status(200).json({ ideas: [] })
  }
})

export const suggestTaskBreakdown = onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.status(204).send('')
    return
  }

  if (request.method !== 'POST') {
    response.set('Allow', 'POST')
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
  const notes = typeof request.body?.notes === 'string' ? request.body.notes.trim().slice(0, 300) : ''
  const clarity = typeof request.body?.clarity === 'string' ? request.body.clarity.trim().slice(0, 200) : ''

  if (!title) {
    response.status(400).json({ error: 'A task title is required.' })
    return
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 350,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You break a large household or relationship task into 2-4 concrete smaller steps.

Rules:
- Each step must be completable in one sitting.
- Steps must be in logical order.
- Titles: short, action-oriented, no more than 8 words.
- doneWhen: one concrete, observable finish line.
- Effort: "Quick" (under 30 min), "Medium" (1-2 hours). Avoid "Heavy".
- Do not repeat or paraphrase the parent task title.
- No fluff or obvious filler steps.

Return strict JSON:
{
  "steps": [
    { "title": string, "effort": "Quick" | "Medium", "doneWhen": string }
  ]
}`,
        },
        {
          role: 'user',
          content: JSON.stringify({ title, notes, clarity }),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content ?? ''
    try {
      const parsed = JSON.parse(content)
      const steps = Array.isArray(parsed.steps)
        ? parsed.steps
            .map((step) => ({
              title: typeof step.title === 'string' ? step.title.trim() : '',
              effort: ['Quick', 'Medium', 'Heavy'].includes(step.effort) ? step.effort : 'Quick',
              doneWhen: typeof step.doneWhen === 'string' ? step.doneWhen.trim() : '',
            }))
            .filter((step) => step.title)
            .slice(0, 4)
        : []
      response.status(200).json({ steps })
    } catch {
      response.status(200).json({ steps: [] })
    }
  } catch (error) {
    console.error('Task breakdown failed.', error)
    response.status(200).json({ steps: [] })
  }
})

export const onTaskCreated = onDocumentCreated('tasks/{taskId}', async (event) => {
  const task = event.data?.data()
  if (!task || !task.requestedBy) return
  if (!task.assignedTo || task.assignedTo === task.requestedBy) return

  const requesterSnapshot = await db.collection('users').doc(task.requestedBy).get()
  const fromName = requesterSnapshot.data()?.name ?? 'Your partner'
  const taskTitle = normalizeTaskTitle(task.title)

  if (task.assignedTo === 'both') {
    const usersSnapshot = await db.collection('users').get()
    const partner = usersSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .find((user) => user.id !== task.requestedBy)
    if (partner) {
      await sendToUser(partner.id, 'Follow Through', `${fromName} added: ${taskTitle}`, { taskId: event.params.taskId, kind: 'assigned' })
    }
  } else {
    await sendToUser(task.assignedTo, 'Follow Through', `${fromName} added: ${taskTitle}`, { taskId: event.params.taskId, kind: 'assigned' })
  }
})

export const onTaskUpdated = onDocumentUpdated('tasks/{taskId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return

  const taskTitle = normalizeTaskTitle(after.title)

  if (!before.isCompleted && after.isCompleted) {
    const points = POINTS_BY_EFFORT[after.effort] ?? 1
    const assignedToSingle = after.assignedTo && after.assignedTo !== 'both' ? after.assignedTo : null

    if (assignedToSingle) {
      const userRef = db.collection('users').doc(assignedToSingle)
      await db.runTransaction(async (transaction) => {
        const userSnapshot = await transaction.get(userRef)
        const user = userSnapshot.data() ?? {}
        transaction.set(userRef, {
          totalPoints: (user.totalPoints ?? 0) + points,
          weeklyPoints: (user.weeklyPoints ?? 0) + points,
        }, { merge: true })
      })

      if (after.requestedBy && after.requestedBy !== assignedToSingle) {
        const assigneeSnap = await db.collection('users').doc(assignedToSingle).get()
        const assigneeName = assigneeSnap.data()?.name ?? 'Your partner'
        await sendToUser(after.requestedBy, 'Follow Through', `${assigneeName} completed: ${taskTitle}`, { taskId: event.params.taskId, kind: 'completed' })
      }
    }
  }

  if (before.assignedTo !== after.assignedTo && after.assignedTo && after.requestedBy) {
    const newAssignee = after.assignedTo
    if (newAssignee !== 'both' && newAssignee !== after.requestedBy) {
      const requesterSnap = await db.collection('users').doc(after.requestedBy).get()
      const fromName = requesterSnap.data()?.name ?? 'Your partner'
      await sendToUser(newAssignee, 'Follow Through', `${fromName} assigned you: ${taskTitle}`, { taskId: event.params.taskId, kind: 'reassigned' })
    }
  }
})

export const sendTestNotification = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to test notifications.')
  }

  const userSnapshot = await db.collection('users').doc(request.auth.uid).get()
  const user = userSnapshot.data()

  if (!user?.pushToken) {
    throw new HttpsError('failed-precondition', 'No saved push token was found for this user.')
  }

  await sendToUser(
    request.auth.uid,
    'Follow Through test',
    'Notifications are connected and ready.',
    { kind: 'test' },
  )

  return { ok: true }
})

export const registerPushToken = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to register notifications.')
  }

  const token = typeof request.data?.token === 'string' ? request.data.token.trim() : ''
  if (!token) {
    throw new HttpsError('invalid-argument', 'A push token is required.')
  }

  const userSnapshot = await db.collection('users').doc(request.auth.uid).get()
  const existingToken = userSnapshot.data()?.pushToken
  const isNewToken = existingToken !== token

  await db.collection('users').doc(request.auth.uid).set(
    {
      pushToken: token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  if (isNewToken) {
    try {
      const response = await sendToToken(
        token,
        'Follow Through notifications enabled',
        'You will get a heads-up when something needs attention.',
        { kind: 'test' },
      )

      console.info(`Notification registration verified for ${request.auth.uid}`, { messageId: response })
    } catch (error) {
      console.error(`Notification registration test failed for ${request.auth.uid}`, error)

      if (INVALID_TOKEN_ERRORS.has(error?.code)) {
        await db.collection('users').doc(request.auth.uid).set(
          {
            pushToken: admin.firestore.FieldValue.delete(),
          },
          { merge: true },
        )
      }

      throw new HttpsError('internal', error?.message ?? 'Could not verify push notifications.')
    }
  }

  return { ok: true }
})

export const morningDigest = onSchedule(
  {
    schedule: '30 7 * * *',
    timeZone: 'America/Los_Angeles',
  },
  async () => {
    const usersSnapshot = await db.collection('users').get()
    await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const [personalSnap, bothSnap] = await Promise.all([
          db.collection('tasks').where('assignedTo', '==', userDoc.id).where('isCompleted', '==', false).get(),
          db.collection('tasks').where('assignedTo', '==', 'both').where('isCompleted', '==', false).get(),
        ])
        const tasks = [
          ...personalSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          ...bothSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        ]
        const topTask = tasks[0]
        if (!topTask) return
        await sendToUser(
          userDoc.id,
          'Follow Through',
          `Start here: ${topTask.title}. You've got ${tasks.length} open.`,
          { kind: 'morning' },
        )
      }),
    )
  },
)

export const eveningWrapUp = onSchedule(
  {
    schedule: '0 19 * * *',
    timeZone: 'America/Los_Angeles',
  },
  async () => {
    const usersSnapshot = await db.collection('users').get()
    await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const [personalSnap, bothSnap] = await Promise.all([
          db.collection('tasks').where('assignedTo', '==', userDoc.id).where('isCompleted', '==', false).get(),
          db.collection('tasks').where('assignedTo', '==', 'both').where('isCompleted', '==', false).get(),
        ])
        const openCount = personalSnap.size + bothSnap.size
        if (!openCount) return
        await sendToUser(userDoc.id, 'Follow Through', `${openCount} still open. Quick win before tomorrow?`, {
          kind: 'evening',
        })
      }),
    )
  },
)

export const dueSoonSweep = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'America/Los_Angeles',
  },
  async () => {
    const now = Date.now()
    const windowEnd = now + 2 * 60 * 60 * 1000
    const cooldownMs = 4 * 60 * 60 * 1000
    const tasksSnapshot = await db.collection('tasks').where('isCompleted', '==', false).get()

    const usersSnapshot = await db.collection('users').get()
    const allUserIds = usersSnapshot.docs.map((doc) => doc.id)

    await Promise.all(
      tasksSnapshot.docs.map(async (taskDoc) => {
        const task = taskDoc.data()
        const dueDate = task.dueDate?.toDate ? task.dueDate.toDate().getTime() : new Date(task.dueDate).getTime()
        if (Number.isNaN(dueDate) || dueDate < now || dueDate > windowEnd) return

        const lastNotified = task.dueSoonNotifiedAt?.toDate?.()?.getTime() ?? null
        if (lastNotified && now - lastNotified < cooldownMs) return

        const targetIds = task.assignedTo === 'both' ? allUserIds : [task.assignedTo]
        await Promise.all(
          targetIds.map((uid) =>
            sendToUser(uid, 'Follow Through', `${task.title} needs attention`, {
              taskId: taskDoc.id,
              kind: 'due-soon',
            }),
          ),
        )
        await db.collection('tasks').doc(taskDoc.id).update({
          dueSoonNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }),
    )
  },
)

// Send a push notification to a specific FCM token.
// Callable from authenticated frontend clients (e.g. manual test or power-user sends).
export const sendNotification = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const token = typeof request.data?.token === 'string' ? request.data.token.trim() : ''
  const title = typeof request.data?.title === 'string' ? request.data.title.trim() : ''
  const body = typeof request.data?.body === 'string' ? request.data.body.trim() : ''

  if (!token || !title) {
    throw new HttpsError('invalid-argument', 'token and title are required.')
  }

  try {
    await sendToToken(token, title, body, { kind: 'manual', sentBy: request.auth.uid })
    return { ok: true }
  } catch (error) {
    throw new HttpsError('internal', error?.message ?? 'Could not send notification.')
  }
})

// ── Adaptive notification system ─────────────────────────────────────────────

const MESSAGE_POOLS = {
  checkIn: {
    low: [
      'Coming up on a week since your last check-in.',
      'Almost a week — worth scheduling a check-in soon.',
      "It's been a few days. A quick check-in would help.",
    ],
    medium: [
      "It's been over a week since your last check-in.",
      'A week and change without a check-in. Things can drift.',
      'Your check-in is overdue. Pick a time this week.',
    ],
    high: [
      "It's been over two weeks. A lot can pile up unspoken.",
      'Two weeks without a check-in — time to reconnect.',
      'Been a while. A check-in now could prevent bigger friction later.',
    ],
  },
  dateNight: {
    low: [
      'No date night in a few weeks — good time to plan one.',
      "It's been a while since your last date night.",
      'Three weeks since a date night. Worth scheduling something.',
    ],
    medium: [
      "It's been over a month without a date night.",
      'Getting close to five weeks since your last date.',
      'Time slips by — over a month and no date night yet.',
    ],
    high: [
      'Nearly two months since your last date night.',
      "It's been a long stretch. A date night is overdue.",
      'Seven weeks without a date night — make some time.',
    ],
  },
  partnerTasks: {
    low: [
      "A couple things your partner added are still waiting on you.",
      "Your partner added some tasks that haven't been touched yet.",
      'A few items from your partner are sitting in your queue.',
    ],
    medium: [
      'Several things your partner requested have been waiting a while.',
      'Partner tasks are piling up. Worth clearing some today.',
      "Your partner added a few things — they've been sitting for days.",
    ],
    high: [
      'Tasks your partner added have been waiting over a week.',
      'A lot of what your partner requested is still untouched.',
      "Your partner's tasks are really overdue — five or more pending.",
    ],
  },
}

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 }

function isWithinSendWindow(now) {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Los_Angeles',
    }).format(now),
    10,
  )
  return hour >= 8 && hour < 20
}

function checkInSeverity(daysSince) {
  if (daysSince >= 11) return 'high'
  if (daysSince >= 8) return 'medium'
  if (daysSince >= 6) return 'low'
  return null
}

function dateNightSeverity(daysSince) {
  if (daysSince === null) return null
  if (daysSince >= 50) return 'high'
  if (daysSince >= 35) return 'medium'
  if (daysSince >= 20) return 'low'
  return null
}

function partnerTasksSeverity(count) {
  if (count >= 5) return 'high'
  if (count >= 3) return 'medium'
  if (count >= 1) return 'low'
  return null
}

function pickMessage(pool, lastMessage) {
  const candidates = pool.filter((m) => m !== lastMessage)
  const source = candidates.length ? candidates : pool
  return source[Math.floor(Math.random() * source.length)]
}

// Returns { title, body, type, severity } for the highest-severity active issue,
// or null if nothing warrants a notification.
function buildNotification(daysSinceCheckIn, daysSinceDateNight, staleCount, lastMessage) {
  const candidates = []

  const checkInSev = daysSinceCheckIn !== null ? checkInSeverity(daysSinceCheckIn) : null
  if (checkInSev) candidates.push({ type: 'checkIn', severity: checkInSev, rank: SEVERITY_RANK[checkInSev] })

  const dateNightSev = dateNightSeverity(daysSinceDateNight)
  if (dateNightSev) candidates.push({ type: 'dateNight', severity: dateNightSev, rank: SEVERITY_RANK[dateNightSev] })

  const partnerSev = partnerTasksSeverity(staleCount)
  if (partnerSev) candidates.push({ type: 'partnerTasks', severity: partnerSev, rank: SEVERITY_RANK[partnerSev] })

  if (!candidates.length) return null

  const top = candidates.reduce((best, c) => (c.rank > best.rank ? c : best))
  const pool = MESSAGE_POOLS[top.type][top.severity]
  const body = pickMessage(pool, lastMessage)

  return { title: 'Follow Through', body, type: top.type, severity: top.severity }
}

// Adaptive daily reminders — runs at 9 AM Pacific.
// Picks the highest-severity issue per user, selects a random non-repeat message
// from that tier's pool, and enforces a 24h global cooldown + dedupe.
export const smartDailyCheck = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'America/Los_Angeles' },
  async () => {
    const now = new Date()
    if (!isWithinSendWindow(now)) return

    const oneDayMs = 24 * 60 * 60 * 1000
    const cooldownMs = 24 * 60 * 60 * 1000

    // Find the most recent completed date night across all history.
    const dateHistorySnapshot = await db.collection('dateHistory').get()
    let latestDateNight = null
    for (const histDoc of dateHistorySnapshot.docs) {
      const data = histDoc.data()
      const completedAt =
        data.dateCompleted?.toDate?.() ??
        (data.dateCompleted ? new Date(data.dateCompleted) : null)
      if (completedAt && !Number.isNaN(completedAt.getTime())) {
        if (!latestDateNight || completedAt > latestDateNight) latestDateNight = completedAt
      }
    }
    const daysSinceDateNight = latestDateNight ? Math.floor((now - latestDateNight) / oneDayMs) : null

    const usersSnapshot = await db.collection('users').get()
    await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const user = userDoc.data()
        if (!user?.pushToken) return

        const notifications = user.notifications ?? {}

        // ── Fatigue control: global 24h cooldown ─────────────────────────
        const lastSentAt = notifications.lastSentAt?.toDate?.()
        if (lastSentAt && now - lastSentAt < cooldownMs) return

        // ── Inputs ───────────────────────────────────────────────────────
        const lastCheckIn =
          user.checkIn?.lastCompletedAt?.toDate?.() ??
          (user.lastCheckInAt ? new Date(user.lastCheckInAt) : null)
        const daysSinceCheckIn =
          lastCheckIn && !Number.isNaN(lastCheckIn.getTime())
            ? Math.floor((now - lastCheckIn) / oneDayMs)
            : null

        const tasksSnapshot = await db
          .collection('tasks')
          .where('assignedTo', '==', userDoc.id)
          .where('isCompleted', '==', false)
          .get()
        const staleCount = tasksSnapshot.docs
          .map((taskDoc) => taskDoc.data())
          .filter((task) => {
            if (!task.requestedBy || task.requestedBy === userDoc.id) return false
            const createdAt =
              task.createdAt?.toDate?.() ?? (task.createdAt ? new Date(task.createdAt) : null)
            if (!createdAt || Number.isNaN(createdAt.getTime())) return false
            return Math.floor((now - createdAt) / oneDayMs) >= 3
          }).length

        const lastMessage = notifications.lastMessage ?? null

        // ── Build notification ───────────────────────────────────────────
        const notif = buildNotification(daysSinceCheckIn, daysSinceDateNight, staleCount, lastMessage)
        if (!notif) return

        // ── Dedupe ───────────────────────────────────────────────────────
        if (notif.body === lastMessage) return

        // ── Send ─────────────────────────────────────────────────────────
        await sendToUser(userDoc.id, notif.title, notif.body, {
          kind: 'smart-daily',
          type: notif.type,
          severity: notif.severity,
        })

        // ── Persist ──────────────────────────────────────────────────────
        await db.collection('users').doc(userDoc.id).update({
          'notifications.lastSentAt': admin.firestore.FieldValue.serverTimestamp(),
          'notifications.lastMessage': notif.body,
          'notifications.lastType': notif.type,
          'notifications.lastSeverity': notif.severity,
        })
      }),
    )
  },
)
