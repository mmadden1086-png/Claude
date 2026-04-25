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

function fallbackSuggestion(title = 'Task') {
  return {
    doneWhen: `${title} is fully done`,
    why: "So it's ready when you need it",
  }
}

function parseSuggestionContent(content, title) {
  try {
    const parsed = JSON.parse(content)
    const doneWhen = typeof parsed.doneWhen === 'string' ? parsed.doneWhen.trim() : ''
    const why = typeof parsed.why === 'string' ? parsed.why.trim() : ''

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
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You generate short, real-world task suggestions.

DONE WHEN:
- describe what it looks like when the task is actually done
- include the object
- no words like completed, handled, managed
- if the task is a project like finish, build, launch, or complete, say the object is complete and ready to use
- if the task starts with help, say the person has what they need and is ready

WHY:
- explain real-world impact
- 1 short sentence
- no productivity or system language
- for project tasks, say: So it's actually finished and not left in progress
- for help tasks, say: So they're not stuck without it

Never use:
handled, managed, organized, follow-up, completed, efficient

Keep it simple and natural.`,
        },
        {
          role: 'user',
          content: `Task: ${title}
Assigned to: ${assignedTo || 'unknown'}
Requested by: ${requestedBy || 'none'}

Return JSON with:
doneWhen
why`,
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
      temperature: 0.3,
      max_tokens: 50,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are writing a short, real-world observation.

Be direct, neutral, and grounded.

Do not:
- guilt
- exaggerate
- use system language

Keep under 12 words.
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
      temperature: 0.3,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You suggest concrete follow-through tasks after a weekly partner check-in.

Rules:
- Return 1 to 3 tasks max.
- Make each task a small next action, not a summary.
- Keep titles short and real-world.
- Use neutral language.
- Do not use guilt, blame, productivity language, or system language.
- Prefer tasks that resolve overdue, partner-requested, or discussion items.

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

export const onTaskCreated = onDocumentCreated('tasks/{taskId}', async (event) => {
  const task = event.data?.data()
  if (!task) return

  if (task.assignedTo && task.assignedTo !== task.requestedBy) {
    const requesterSnapshot = await db.collection('users').doc(task.requestedBy).get()
    const requester = requesterSnapshot.data()
    await sendToUser(
      task.assignedTo,
      'Follow Through',
      `${requester?.name ?? 'Your partner'} assigned: ${task.title}`,
      { taskId: event.params.taskId, kind: 'assigned' },
    )
  }
})

export const onTaskCompleted = onDocumentUpdated('tasks/{taskId}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return

  if (!before.isCompleted && after.isCompleted) {
    const points = POINTS_BY_EFFORT[after.effort] ?? 1
    const userRef = db.collection('users').doc(after.assignedTo)

    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef)
      const user = userSnapshot.data() ?? {}
      transaction.set(
        userRef,
        {
          totalPoints: (user.totalPoints ?? 0) + points,
          weeklyPoints: (user.weeklyPoints ?? 0) + points,
        },
        { merge: true },
      )
    })
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

  await db.collection('users').doc(request.auth.uid).set(
    {
      pushToken: token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

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
        const tasksSnapshot = await db
          .collection('tasks')
          .where('assignedTo', '==', userDoc.id)
          .where('isCompleted', '==', false)
          .get()
        const tasks = tasksSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
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
        const tasksSnapshot = await db
          .collection('tasks')
          .where('assignedTo', '==', userDoc.id)
          .where('isCompleted', '==', false)
          .get()
        const openCount = tasksSnapshot.size
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
    const tasksSnapshot = await db.collection('tasks').where('isCompleted', '==', false).get()

    await Promise.all(
      tasksSnapshot.docs.map(async (taskDoc) => {
        const task = taskDoc.data()
        const dueDate = task.dueDate?.toDate ? task.dueDate.toDate().getTime() : new Date(task.dueDate).getTime()
        if (Number.isNaN(dueDate) || dueDate < now || dueDate > windowEnd) return
        await sendToUser(task.assignedTo, 'Follow Through', `${task.title} needs attention`, {
          taskId: taskDoc.id,
          kind: 'due-soon',
        })
      }),
    )
  },
)
