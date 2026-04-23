import admin from 'firebase-admin'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'

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
