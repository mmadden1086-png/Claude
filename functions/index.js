const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()

const db = getFirestore()
const messaging = getMessaging()

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sendPush = async (token, title, body, data = {}) => {
  if (!token) return
  try {
    await messaging.send({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      webpush: {
        notification: { icon: '/icon-192.png' },
        fcmOptions: { link: '/' },
      },
    })
  } catch (err) {
    console.error('Push send error:', err.code, err.message)
  }
}

const getUserToken = async (uid) => {
  const snap = await db.collection('users').doc(uid).get()
  return snap.exists ? snap.data().pushToken : null
}

const getUserName = async (uid) => {
  const snap = await db.collection('users').doc(uid).get()
  return snap.exists ? snap.data().name || 'Someone' : 'Someone'
}

// ─── Trigger: New task assigned ──────────────────────────────────────────────
// Notify the assigned user when a task is created and assigned to someone else

exports.onTaskCreated = onDocumentCreated('tasks/{taskId}', async (event) => {
  const task = event.data?.data()
  if (!task) return

  const { assignedTo, requestedBy, title } = task
  if (!assignedTo || !title) return

  // Only notify if assigned to someone other than creator
  if (assignedTo === requestedBy) return

  const [token, requesterName] = await Promise.all([
    getUserToken(assignedTo),
    getUserName(requestedBy),
  ])

  await sendPush(
    token,
    'New task assigned',
    `${requesterName} assigned: ${title}`,
    { taskId: event.params.taskId }
  )
})

// ─── Trigger: Task reassigned ─────────────────────────────────────────────────
// Notify when assignedTo changes

exports.onTaskUpdated = onDocumentUpdated('tasks/{taskId}', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  if (!before || !after) return

  const { assignedTo: newAssignee, requestedBy, title, isCompleted } = after
  const { assignedTo: prevAssignee } = before

  // Skip if task was completed (avoid noise)
  if (isCompleted && !before.isCompleted) return

  // Notify on reassignment to a different user
  if (newAssignee && newAssignee !== prevAssignee && newAssignee !== requestedBy) {
    const [token, requesterName] = await Promise.all([
      getUserToken(newAssignee),
      getUserName(requestedBy),
    ])
    await sendPush(
      token,
      'Task assigned to you',
      `${requesterName} assigned: ${title}`,
      { taskId: event.params.taskId }
    )
  }
})

// ─── Scheduled: Morning digest — 7:30 AM daily ───────────────────────────────

exports.morningDigest = onSchedule(
  { schedule: '30 7 * * *', timeZone: 'America/Chicago' },
  async () => {
    const usersSnap = await db.collection('users').get()
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data()
      if (!user.pushToken) continue

      // Get their open tasks
      const tasksSnap = await db
        .collection('tasks')
        .where('assignedTo', '==', userDoc.id)
        .where('isCompleted', '==', false)
        .get()

      const openTasks = tasksSnap.docs.map((d) => d.data())

      // Find highest priority (overdue first, then today)
      const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < todayStr)
      const today = openTasks.filter((t) => t.dueDate === todayStr)
      const top = overdue[0] || today[0] || openTasks[0]

      if (!top) continue

      await sendPush(
        user.pushToken,
        'Good morning',
        `Start here: ${top.title}. You've got ${openTasks.length} open.`
      )
    }
  }
)

// ─── Scheduled: Evening wrap-up — 7:00 PM daily ──────────────────────────────

exports.eveningWrapUp = onSchedule(
  { schedule: '0 19 * * *', timeZone: 'America/Chicago' },
  async () => {
    const usersSnap = await db.collection('users').get()

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data()
      if (!user.pushToken) continue

      const tasksSnap = await db
        .collection('tasks')
        .where('assignedTo', '==', userDoc.id)
        .where('isCompleted', '==', false)
        .get()

      const count = tasksSnap.size
      if (count === 0) continue

      await sendPush(
        user.pushToken,
        'Evening check-in',
        `${count} still open. Quick win before tomorrow?`
      )
    }
  }
)

// ─── Scheduled: Due-soon check — every 30 minutes ────────────────────────────

exports.dueSoonCheck = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'America/Chicago' },
  async () => {
    const now = new Date()
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    const todayStr = now.toISOString().split('T')[0]
    const in2hStr = in2h.toISOString().split('T')[0]

    // Tasks due today with a specific time within the next 2 hours
    const tasksSnap = await db
      .collection('tasks')
      .where('isCompleted', '==', false)
      .where('dueDate', '==', todayStr)
      .get()

    for (const taskDoc of tasksSnap.docs) {
      const task = taskDoc.data()
      if (!task.dueTime || !task.assignedTo) continue

      const [h, m] = task.dueTime.split(':').map(Number)
      const dueAt = new Date(now)
      dueAt.setHours(h, m, 0, 0)

      const diffMs = dueAt - now
      // Notify if due within 30-120 minutes and not already notified
      if (diffMs > 30 * 60 * 1000 && diffMs <= 2 * 60 * 60 * 1000) {
        const token = await getUserToken(task.assignedTo)
        if (!token) continue
        const minsLeft = Math.round(diffMs / 60000)
        await sendPush(
          token,
          'Due soon',
          `${task.title} — due in ~${minsLeft} minutes`,
          { taskId: taskDoc.id }
        )
      }
    }
  }
)

// ─── Scheduled: Reset weekly points — Sunday midnight ────────────────────────

exports.resetWeeklyPoints = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/Chicago' },
  async () => {
    const usersSnap = await db.collection('users').get()
    const batch = db.batch()
    for (const userDoc of usersSnap.docs) {
      batch.update(userDoc.ref, { weeklyPoints: 0 })
    }
    await batch.commit()
  }
)
