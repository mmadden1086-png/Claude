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
