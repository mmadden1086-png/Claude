import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_USER_GOALS } from '../lib/constants'
import {
  canUseFirebase,
  createDateHistory,
  createDateIdea,
  createTask,
  deleteTask,
  restoreTask,
  subscribeToDateHistory,
  subscribeToDateIdeas,
  subscribeToTasks,
  subscribeToUsers,
  updateTask as updateTaskDoc,
  upsertUserProfile,
} from '../lib/firestore'
import { TASK_STATUS } from '../lib/constants'
import { toDate } from '../lib/format'

export function useSharedData(currentUser) {
  const [users, setUsers] = useState([])
  const [tasks, setTasks] = useState([])
  const [dateIdeas, setDateIdeas] = useState([])
  const [dateHistory, setDateHistory] = useState([])
  const [loadedUserId, setLoadedUserId] = useState(null)
  const [error, setError] = useState(() => (canUseFirebase() ? '' : 'Firebase is not configured for this build.'))
  const currentUserId = currentUser?.id ?? currentUser?.uid ?? null

  useEffect(() => {
    if (!canUseFirebase()) return undefined
    if (!currentUser) return undefined

    const unsubUsers = subscribeToUsers(
      (nextUsers) => {
        setError('')
        setUsers(nextUsers)
        setLoadedUserId(currentUserId)
      },
      (nextError) => {
        setError(nextError.message)
        setUsers([])
      },
    )
    const unsubTasks = subscribeToTasks(
      (nextTasks) => {
        setError('')
        setTasks(nextTasks)
        setLoadedUserId(currentUserId)
      },
      (nextError) => {
        setError(nextError.message)
        setTasks([])
      },
    )
    const unsubDateIdeas = subscribeToDateIdeas(
      (nextIdeas) => {
        setError('')
        setDateIdeas(nextIdeas)
      },
      (nextError) => {
        setError(nextError.message)
        setDateIdeas([])
      },
    )
    const unsubDateHistory = subscribeToDateHistory(
      (nextHistory) => {
        setError('')
        setDateHistory(nextHistory)
      },
      (nextError) => {
        setError(nextError.message)
        setDateHistory([])
      },
    )

    return () => {
      unsubUsers()
      unsubTasks()
      unsubDateIdeas()
      unsubDateHistory()
    }
  }, [currentUser, currentUserId])

  const profileUserId = currentUser?.id ?? currentUser?.uid ?? null
  const profileName = currentUser?.name ?? currentUser?.displayName ?? currentUser?.email?.split('@')[0] ?? 'User'
  const profileEmail = currentUser?.email ?? ''
  const liveProfile = useMemo(() => users.find((user) => user.id === profileUserId) ?? null, [profileUserId, users])

  useEffect(() => {
    const userId = profileUserId
    if (!userId) return
    void upsertUserProfile({
      id: userId,
      name: profileName,
      email: profileEmail,
    })
  }, [profileEmail, profileName, profileUserId])

  useEffect(() => {
    const userId = profileUserId
    if (!userId || !liveProfile) return

    const needsGoals =
      liveProfile.goals?.weeklyCompletion === undefined ||
      liveProfile.goals?.dailyMinimum === undefined ||
      liveProfile.goals?.reliabilityTarget === undefined

    if (!needsGoals) return

    void upsertUserProfile({
      id: userId,
      goals: {
        weeklyCompletion: liveProfile.goals?.weeklyCompletion ?? DEFAULT_USER_GOALS.weeklyCompletion,
        dailyMinimum: liveProfile.goals?.dailyMinimum ?? DEFAULT_USER_GOALS.dailyMinimum,
        reliabilityTarget: liveProfile.goals?.reliabilityTarget ?? DEFAULT_USER_GOALS.reliabilityTarget,
      },
    })
  }, [liveProfile, profileUserId])

  useEffect(() => {
    if (!currentUserId || !tasks.length) return

    const now = new Date()
    const readyTasks = tasks.filter((task) => {
      if (task.isMissed) return false
      if (task.status !== TASK_STATUS.SNOOZED) return false
      const snoozedUntil = toDate(task.snoozedUntil)
      return snoozedUntil && snoozedUntil <= now
    })

    if (!readyTasks.length) return

    void Promise.all(
      readyTasks.map((task) =>
        updateTaskDoc(task.id, {
          status: TASK_STATUS.NOT_STARTED,
          snoozedUntil: null,
          isCompleted: false,
          inProgress: false,
          startedAt: null,
          history: [...(task.history ?? []), { type: 'repeat-reactivated', at: now.toISOString(), by: currentUserId }],
        }),
      ),
    )
  }, [currentUserId, tasks])

  const actions = useMemo(
    () => ({
      async createTask(payload) {
        if (canUseFirebase()) {
          await createTask(payload)
          return
        }
        throw new Error('Firebase is not configured yet.')
      },
      async updateTask(taskId, updates) {
        if (canUseFirebase()) {
          await updateTaskDoc(taskId, updates)
          return
        }
        throw new Error(`Firebase is not configured yet for task ${taskId}.`)
      },
      async restoreTask(taskId, snapshot) {
        if (canUseFirebase()) {
          await restoreTask(taskId, snapshot)
          return
        }
        throw new Error(`Firebase is not configured yet for task ${taskId}.`)
      },
      async deleteTask(taskId) {
        if (canUseFirebase()) {
          await deleteTask(taskId)
          return
        }
        throw new Error(`Firebase is not configured yet for task ${taskId}.`)
      },
      async updateUserProfile(profile) {
        if (canUseFirebase()) {
          await upsertUserProfile(profile)
          return
        }
        throw new Error(`Firebase is not configured yet for user ${profile?.id ?? 'unknown'}.`)
      },
      async createDateIdea(payload) {
        if (canUseFirebase()) {
          await createDateIdea(payload)
          return
        }
        throw new Error('Firebase is not configured yet for date ideas.')
      },
      async createDateHistory(payload) {
        if (canUseFirebase()) {
          await createDateHistory(payload)
          return
        }
        throw new Error('Firebase is not configured yet for date history.')
      },
    }),
    [],
  )

  const loading = Boolean(currentUserId) && canUseFirebase() && loadedUserId !== currentUserId

  return { users, tasks, dateIdeas, dateHistory, loading, error, actions, usingMockData: false }
}
