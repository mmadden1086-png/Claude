import { addDays } from 'date-fns'
import { TimerReset } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionSheetModal } from './components/ActionSheetModal'
import { ConfirmModal } from './components/ConfirmModal'
import { DateCompletionModal } from './components/DateCompletionModal'
import { DateIdeaModal } from './components/DateIdeaModal'
import { AuthScreen } from './components/AuthScreen'
import { DuplicateTaskModal } from './components/DuplicateTaskModal'
import { GoalSettingsModal } from './components/GoalSettingsModal'
import { StatsDrilldownModal } from './components/StatsDrilldownModal'
import { TaskDetailModal } from './components/TaskDetailModal'
import { ToastStack } from './components/ToastStack'
import { AppShell } from './layout/AppShell'
import { ACTION_SNOOZE_OPTIONS, BOTH_ASSIGNEE_ID, DEFAULT_USER_GOALS, RESCHEDULE_OPTIONS, SNOOZE_OPTIONS, TASK_STATUS, USERS, getCanonicalUserName } from './lib/constants'
import {
  buildDateTask,
  createDateIdeaPayload,
  dateNightActivitySummary,
  getDateNightIdeaTitle,
  getDateNightReminderState,
  getMonthlyDateStatus,
  isDateNightTask,
  recentDateEntries,
  repeatHistoryEntries,
  suggestDateTaskSchedule,
  topRatedDateIdeas,
} from './lib/date-night'
import { getTaskStatus, resolveRescheduleDate, resolveSnoozeUntil, toDate } from './lib/format'
import { logout } from './lib/firestore'
import { useAuthSession } from './hooks/use-auth'
import { useNotifications } from './hooks/use-notifications'
import { useSharedData } from './hooks/use-shared-data'
import { appendHistory, computeStats, createTaskPayload, deriveSections, getBannerMessage, getPointsForTask } from './lib/task-utils'
import { detectDuplicateTask, getSmartRetryDate } from './lib/task-decision'
import { advanceRepeatingTask, shouldAdvanceRepeat } from './lib/task-state'

const FILTER_STORAGE_KEY = 'follow-through-filter'
const DATE_REMINDER_STORAGE_KEY = 'follow-through-date-reminders'
const FOCUS_MODE_STORAGE_KEY = 'follow-through-focus-mode'
const LOW_ENERGY_STORAGE_KEY = 'follow-through-low-energy'
const SNOOZE_PRESET_STORAGE_KEY = 'follow-through-snooze-preset'
const TASK_MOTION_DURATION = 140
const TASK_MOTION_CLEAR_DELAY = 420

function readDateReminderState() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(DATE_REMINDER_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeDateReminderState(state) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DATE_REMINDER_STORAGE_KEY, JSON.stringify(state))
}

function getTaskReminderEntry(state, taskId) {
  return state?.[taskId] ?? {}
}

function findCurrentUser(sessionUser, users) {
  if (!sessionUser) return null
  const existing = users.find((user) => user.id === sessionUser.uid || user.email === sessionUser.email)
  const canonicalName = getCanonicalUserName(sessionUser.email, sessionUser.displayName ?? existing?.name ?? 'You')
  const goals = {
    weeklyCompletion: existing?.goals?.weeklyCompletion ?? DEFAULT_USER_GOALS.weeklyCompletion,
    dailyMinimum: existing?.goals?.dailyMinimum ?? DEFAULT_USER_GOALS.dailyMinimum,
    reliabilityTarget: existing?.goals?.reliabilityTarget ?? DEFAULT_USER_GOALS.reliabilityTarget,
  }

  return {
    id: sessionUser.uid,
    name: canonicalName,
    email: sessionUser.email ?? existing?.email ?? '',
    pushToken: existing?.pushToken ?? '',
    totalPoints: existing?.totalPoints ?? 0,
    weeklyPoints: existing?.weeklyPoints ?? 0,
    goals,
  }
}

function applyFilter(tasks, filterId, currentUser) {
  if (filterId === 'mine') return tasks.filter((task) => task.assignedTo === currentUser.id)
  if (filterId === 'partner') return tasks.filter((task) => task.assignedTo !== currentUser.id)
  return tasks
}

function findPartner(currentUser, users) {
  const livePartner = users.find((user) => user.id !== currentUser?.id)
  if (livePartner) return livePartner

  const fallback = USERS.find((user) => user.email !== currentUser?.email)
  return {
    id: fallback?.id ?? 'partner',
    name: fallback?.name ?? 'Partner',
    email: fallback?.email ?? '',
    pushToken: '',
    totalPoints: 0,
    weeklyPoints: 0,
    goals: DEFAULT_USER_GOALS,
  }
}

function getGoalProgress(stats, goals) {
  return {
    weeklyPercent: goals.weeklyCompletion > 0 ? Math.min(100, Math.round((stats.weeklyHandled / goals.weeklyCompletion) * 100)) : 0,
    reliabilityGap: stats.reliability - goals.reliabilityTarget,
  }
}

function getFocusGoalMessage(stats, goals) {
  if (!goals.weeklyCompletion) return ''
  const today = new Date()
  const dayIndex = ((today.getDay() + 6) % 7) + 1
  const expectedByNow = Math.ceil((goals.weeklyCompletion * dayIndex) / 7)
  const gap = expectedByNow - stats.weeklyHandled

  if (gap <= 0) return 'On track for your goal'
  if (gap === 1) return '1 more to stay on pace'
  return `You're ${gap} tasks behind this week`
}

function getGoalSuggestion(stats, goals) {
  if (stats.weeklyHandled >= goals.weeklyCompletion + 3 && stats.reliability >= goals.reliabilityTarget + 10) {
    return 'You are cruising past this goal. Consider nudging it up next week.'
  }
  if (stats.weeklyHandled === 0 && goals.weeklyCompletion >= 10) {
    return 'If this target keeps feeling heavy, lower it a little and rebuild momentum.'
  }
  return ''
}

const GOAL_CONFIG = {
  weeklyCompletion: {
    title: 'Edit weekly goal',
    description: 'Set how many tasks you want handled each week.',
    label: 'Tasks per week',
    min: 1,
    max: 50,
  },
  dailyMinimum: {
    title: 'Edit daily minimum',
    description: 'Set the minimum number of tasks per day to keep the streak steady.',
    label: 'Tasks per day',
    min: 0,
    max: 10,
  },
  reliabilityTarget: {
    title: 'Edit reliability target',
    description: 'Set the on-time completion target you want to aim for.',
    label: 'Target percent',
    min: 0,
    max: 100,
  },
}

function buildUndoMessage(action, label) {
  if (action === 'done') return 'Handled'
  if (action === 'snooze') return `Snoozed until ${label}`
  if (action === 'reschedule') return `Rescheduled to ${label}`
  if (action === 'start') return 'Task started'
  if (action === 'stop') return 'Task stopped'
  return label
}

function normalizeRepeatTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\b(started|again|today|now)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getRelatedFutureRepeats(task, tasks) {
  const sourceDueDate = toDate(task.dueDate)?.getTime() ?? -Infinity
  const normalizedTitle = normalizeRepeatTitle(task.title)

  return tasks.filter((candidate) => {
    if (candidate.id === task.id) return false
    if ((candidate.repeatType ?? 'none') === 'none') return false
    if ((candidate.repeatType ?? 'none') !== (task.repeatType ?? 'none')) return false
    if ((candidate.assignedTo ?? '') !== (task.assignedTo ?? '')) return false
    if (normalizeRepeatTitle(candidate.title) !== normalizedTitle) return false
    const candidateDue = toDate(candidate.dueDate)?.getTime() ?? -Infinity
    return candidateDue >= sourceDueDate
  })
}

function App() {
  const navigate = useNavigate()
  const { sessionUser, loading: authLoading, usingMockAuth } = useAuthSession()
  const { users, tasks, dateIdeas, dateHistory, loading, error, actions, usingMockData } = useSharedData(sessionUser)
  const currentUser = findCurrentUser(sessionUser, users)
  const partner = findPartner(currentUser, users)
  const usersById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
  const { notificationStatus, enableNotifications } = useNotifications(currentUser?.id)

  const [filterId, setFilterId] = useState(() => {
    if (typeof window === 'undefined') return 'mine'
    const savedFilter = window.localStorage.getItem(FILTER_STORAGE_KEY)
    return savedFilter && ['mine', 'partner', 'all'].includes(savedFilter) ? savedFilter : 'mine'
  })
  const [focusMode, setFocusMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true'
  })
  const [lowEnergyMode, setLowEnergyMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(LOW_ENERGY_STORAGE_KEY) === 'true'
  })
  const [quickAddExpanded, setQuickAddExpanded] = useState(false)
  const [toasts, setToasts] = useState([])
  const [snoozePreset, setSnoozePreset] = useState(() => {
    if (typeof window === 'undefined') return 'tomorrow'
    return window.localStorage.getItem(SNOOZE_PRESET_STORAGE_KEY) || 'tomorrow'
  })
  const [startModeTaskId, setStartModeTaskId] = useState(null)
  const [startTimerSeconds, setStartTimerSeconds] = useState(0)
  const [openTaskId, setOpenTaskId] = useState(null)
  const [actionSheet, setActionSheet] = useState(null)
  const [customDate, setCustomDate] = useState('')
  const [statsView, setStatsView] = useState(null)
  const [duplicatePrompt, setDuplicatePrompt] = useState(null)
  const [deletePrompt, setDeletePrompt] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [goalEditor, setGoalEditor] = useState(null)
  const [goalSaveBusy, setGoalSaveBusy] = useState(false)
  const [dateIdeaModalOpen, setDateIdeaModalOpen] = useState(false)
  const [dateIdeaSaveBusy, setDateIdeaSaveBusy] = useState(false)
  const [dateCompletionTask, setDateCompletionTask] = useState(null)
  const [dateCompletionBusy, setDateCompletionBusy] = useState(false)
  const [selectedDateIdea, setSelectedDateIdea] = useState(null)
  const [dateReminderPrompt, setDateReminderPrompt] = useState(null)
  const [dateMorningPrompt, setDateMorningPrompt] = useState(null)
  const [taskMotion, setTaskMotion] = useState({})
  const actionLocks = useRef(new Set())
  const createInFlight = useRef(false)
  const dateReminderState = useRef(readDateReminderState())

  const deferredTasks = useDeferredValue(tasks)
  const filteredTasks = currentUser ? applyFilter(deferredTasks, filterId, currentUser) : []
  const goals = currentUser?.goals ?? DEFAULT_USER_GOALS
  const sections = currentUser ? deriveSections(filteredTasks, currentUser.id, lowEnergyMode, goals) : null
  const stats = useMemo(() => computeStats(tasks), [tasks])
  const goalProgress = getGoalProgress(stats, goals)
  const focusGoalMessage = getFocusGoalMessage(stats, goals)
  const goalSuggestion = getGoalSuggestion(stats, goals)
  const recentDates = useMemo(() => recentDateEntries(dateHistory), [dateHistory])
  const repeatHistory = useMemo(() => repeatHistoryEntries(tasks), [tasks])
  const monthlyDateStatus = useMemo(() => getMonthlyDateStatus(tasks, dateHistory), [dateHistory, tasks])
  const dateNightSummary = useMemo(() => dateNightActivitySummary(dateHistory), [dateHistory])
  const topDateIdeas = useMemo(() => topRatedDateIdeas(dateIdeas, dateHistory), [dateHistory, dateIdeas])
  const banner = getBannerMessage(sections?.topTask, stats)
  const startModeTask = tasks.find((task) => task.id === startModeTaskId) ?? null
  const openTask = tasks.find((task) => task.id === openTaskId) ?? null
  const activeDateReminderPrompt = dateReminderPrompt ? tasks.find((task) => task.id === dateReminderPrompt.id) ?? null : null
  const activeDateMorningPrompt = dateMorningPrompt ? tasks.find((task) => task.id === dateMorningPrompt.id) ?? null : null

  useEffect(() => {
    if (!startModeTask) return undefined
    const timer = window.setInterval(() => {
      setStartTimerSeconds((current) => current + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [startModeTask])

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return
    window.localStorage.setItem(FILTER_STORAGE_KEY, filterId)
  }, [currentUser, filterId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FOCUS_MODE_STORAGE_KEY, String(focusMode))
  }, [focusMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOW_ENERGY_STORAGE_KEY, String(lowEnergyMode))
  }, [lowEnergyMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SNOOZE_PRESET_STORAGE_KEY, snoozePreset)
  }, [snoozePreset])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const activeDateTaskIds = new Set(tasks.filter((task) => isDateNightTask(task)).map((task) => task.id))
    const nextState = Object.fromEntries(
      Object.entries(dateReminderState.current).filter(([taskId]) => activeDateTaskIds.has(taskId)),
    )
    dateReminderState.current = nextState
    writeDateReminderState(nextState)
  }, [tasks])

  useEffect(() => {
    if (!tasks.length) return undefined

    function evaluateDateNightPrompts() {
      const now = new Date()

      for (const task of tasks) {
        if (!isDateNightTask(task)) continue
        const reminderState = getDateNightReminderState(task, now)
        if (!reminderState.eligible) continue

        const reminderEntry = getTaskReminderEntry(dateReminderState.current, task.id)
        const ideaTitle = getDateNightIdeaTitle(task)

        if (reminderState.preReminderReady && !reminderEntry.preSentAt) {
          updateDateReminderEntry(task.id, { preSentAt: now.toISOString() })
          notifyLocally('Follow Through', `Date night today: ${ideaTitle}`)
          addToast(`Date night today: ${ideaTitle}`, null)
          continue
        }

        if (reminderState.overdueReminderReady && !reminderEntry.overduePromptedAt && !dateReminderPrompt && !dateMorningPrompt) {
          updateDateReminderEntry(task.id, { overduePromptedAt: now.toISOString() })
          notifyLocally('Follow Through', 'Still on for tonight?')
          setDateReminderPrompt(task)
          break
        }

        if (reminderState.morningFollowUpReady && !reminderEntry.morningPromptedAt && !dateMorningPrompt && !dateReminderPrompt) {
          updateDateReminderEntry(task.id, { morningPromptedAt: now.toISOString() })
          setDateMorningPrompt(task)
          break
        }
      }
    }

    evaluateDateNightPrompts()
    const timer = window.setInterval(evaluateDateNightPrompts, 60000)
    return () => window.clearInterval(timer)
  }, [dateMorningPrompt, dateReminderPrompt, tasks])

  function addToast(message, undo) {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message, undo }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 5000)
  }

  function setTaskMotionState(taskId, state) {
    setTaskMotion((current) => ({ ...current, [taskId]: state }))
    window.setTimeout(() => {
      setTaskMotion((current) => {
        if (!current[taskId]) return current
        const next = { ...current }
        delete next[taskId]
        return next
      })
    }, TASK_MOTION_CLEAR_DELAY)
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function runWithTaskMotion(taskId, state, callback, options = {}) {
    setTaskMotionState(taskId, state)
    if (options.delayBefore ?? true) {
      await delay(options.delayMs ?? TASK_MOTION_DURATION)
    }
    return callback()
  }

  function getTaskMotionState(taskId) {
    return taskMotion[taskId] ?? ''
  }

  function notifyLocally(title, body) {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    if (window.localStorage.getItem('notificationsEnabled') !== 'true') return
    if (Notification.permission !== 'granted') return

    try {
      new Notification(title, { body })
    } catch {
      // ignore local notification failures and keep the in-app flow moving
    }
  }

  function updateDateReminderEntry(taskId, updates) {
    const nextState = {
      ...dateReminderState.current,
      [taskId]: {
        ...getTaskReminderEntry(dateReminderState.current, taskId),
        ...updates,
      },
    }
    dateReminderState.current = nextState
    writeDateReminderState(nextState)
  }

  function clearDateReminderEntry(taskId) {
    const nextState = { ...dateReminderState.current }
    delete nextState[taskId]
    dateReminderState.current = nextState
    writeDateReminderState(nextState)
  }

  async function runTaskMutation(lockKey, task, updater) {
    const scopedKey = `${task.id}:${lockKey}`
    if (actionLocks.current.has(scopedKey)) return
    actionLocks.current.add(scopedKey)

    try {
      await updater()
    } finally {
      actionLocks.current.delete(scopedKey)
    }
  }

  async function handleQuickAdd(form) {
    if (!currentUser) return undefined
    if (createInFlight.current) return { blocked: true }

    createInFlight.current = true

    try {
      const payload = createTaskPayload(form, currentUser)
      const duplicateTask = detectDuplicateTask(tasks, payload)
      if (duplicateTask) {
        setDuplicatePrompt({ mode: 'create', payload, duplicateTask })
        return { blocked: true }
      }

      await actions.createTask(payload)
      setQuickAddExpanded(false)
      addToast('Task saved', null)
      return { blocked: false }
    } catch {
      addToast('Could not save task', null)
      throw new Error('Could not save task')
    } finally {
      createInFlight.current = false
    }
  }

  async function handleCreateDateIdea(form) {
    setDateIdeaSaveBusy(true)
    try {
      await actions.createDateIdea(createDateIdeaPayload(form))
      setDateIdeaModalOpen(false)
      addToast('Date idea saved', null)
    } finally {
      setDateIdeaSaveBusy(false)
    }
  }

  function handleSelectDateIdea(idea) {
    setSelectedDateIdea(idea)
  }

  async function markDateTaskComplete(task) {
    if (!task || !currentUser) return
    const now = new Date().toISOString()
    await runTaskMutation('date-followup-complete', task, async () => {
      await actions.updateTask(task.id, {
        status: TASK_STATUS.COMPLETED,
        isCompleted: true,
        completedAt: now,
        snoozedUntil: null,
        isMissed: false,
        inProgress: false,
        startedAt: null,
        history: appendHistory(task, 'completed', currentUser.id, { dateNightFollowUp: true }),
      })
    })
    updateDateReminderEntry(task.id, { completedPromptedAt: now })
    setDateCompletionTask(task)
  }

  async function handleCreateDateTask(idea, options = {}) {
    if (!currentUser) return
    await actions.createTask(createTaskPayload(buildDateTask(idea, currentUser, options), currentUser))
    setSelectedDateIdea(null)
    addToast(`Date task added for ${idea.title}`, null)
  }

  async function handleRepeatDateIdea(idea) {
    const latestEntry = recentDates.find((entry) => entry.ideaId === idea.id) ?? null
    const suggested = suggestDateTaskSchedule(latestEntry)
    await handleCreateDateTask(idea, {
      dueDate: suggested.dueDate,
      dueTime: suggested.dueTime,
      tag: 'Proven',
    })
  }

  function handleDateReminderReschedule(task) {
    setDateReminderPrompt(null)
    setActionSheet({ type: 'reschedule', task, snapshot: { ...task } })
    setCustomDate('')
  }

  async function handleCancelDateTask(task) {
    if (!task) return
    setDateMorningPrompt(null)
    await runTaskMutation('date-cancel', task, async () => {
      await actions.deleteTask(task.id)
    })
    clearDateReminderEntry(task.id)
    addToast('Date task cancelled', null)
  }

  function handleStartHere() {
    if (!currentUser) return

    const topTask = sections?.topTask ?? null
    if (topTask) {
      setOpenTaskId(topTask.id)
      setQuickAddExpanded(false)
      return
    }

    setFocusMode(false)
    setQuickAddExpanded(true)
    addToast('Start with a new task', null)
  }

  async function handleEnableNotifications() {
    addToast('Checking notification permissions...', null)

    try {
      const result = await enableNotifications()
      const message = result?.message ?? 'Could not enable notifications.'
      addToast(message, null)

      if (result?.status !== 'enabled' && typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message)
      }
    } catch (enableError) {
      const message = enableError?.message ?? 'Could not enable notifications.'
      addToast(message, null)
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message)
      }
    }
  }

  async function restoreSnapshot(taskId, snapshot) {
    await actions.restoreTask(taskId, snapshot)
  }

  async function handleTaskAction(action, task, options = {}) {
    if (!task || !currentUser) return
    const sourceTask = task.isBrokenDown ? tasks.find((item) => item.id === task.parentTaskId) ?? null : task
    if (!sourceTask) return
    const snapshot = { ...sourceTask }
    const now = new Date().toISOString()
    const status = getTaskStatus(sourceTask)

    if (action === 'done') {
      if (status === TASK_STATUS.COMPLETED) return

      if (task.isBrokenDown && task.parentTaskId) {
        await runWithTaskMotion(sourceTask.id, 'pulse', () =>
          runTaskMutation('done-breakdown', sourceTask, async () => {
            await actions.updateTask(sourceTask.id, {
              status: TASK_STATUS.IN_PROGRESS,
              isCompleted: false,
              completedAt: null,
              isMissed: false,
              snoozedUntil: null,
              inProgress: true,
              startedAt: sourceTask.startedAt ?? now,
              history: appendHistory(sourceTask, 'breakdown-completed', currentUser.id, { originalTitle: task.originalTitle }),
            })
            setStartModeTaskId(sourceTask.id)
            setStartTimerSeconds(0)
            addToast(options.source === 'focus' ? 'Started with a smaller step' : 'Original task is now in progress', async () => restoreSnapshot(sourceTask.id, snapshot))
          })
        )
        return
      }

      const points = getPointsForTask(task)
      const repeatAdvance = shouldAdvanceRepeat(sourceTask) ? advanceRepeatingTask(sourceTask, currentUser.id, now, 'completed') : null
      await runWithTaskMotion(sourceTask.id, repeatAdvance ? 'pulse' : 'exit', () =>
        runTaskMutation('done', sourceTask, async () => {
          await actions.updateTask(sourceTask.id, {
            ...(repeatAdvance
              ? {
                  dueDate: repeatAdvance.dueDate,
                  nextOccurrenceAt: repeatAdvance.nextOccurrenceAt,
                  status: repeatAdvance.status,
                  snoozedUntil: repeatAdvance.snoozedUntil,
                  completedAt: repeatAdvance.completedAt,
                  isCompleted: false,
                  isMissed: false,
                  inProgress: false,
                  startedAt: null,
                  history: appendHistory(
                    {
                      ...sourceTask,
                      history: repeatAdvance.history.slice(0, -1),
                    },
                    'repeat-advanced',
                    currentUser.id,
                    { points, nextDueDate: repeatAdvance.dueDate },
                  ),
                }
              : {
                  status: TASK_STATUS.COMPLETED,
                  isCompleted: true,
                  completedAt: now,
                  snoozedUntil: null,
                  isMissed: false,
                  inProgress: false,
                  startedAt: null,
                  history: appendHistory(sourceTask, 'completed', currentUser.id, { points }),
                }),
          })
          if (startModeTaskId === sourceTask.id) {
            setStartModeTaskId(null)
            setStartTimerSeconds(0)
          }
          addToast(
            repeatAdvance ? 'Completed. Next repeat scheduled' : options.source === 'focus' ? 'Handled' : buildUndoMessage('done', ''),
            async () => restoreSnapshot(sourceTask.id, snapshot),
          )
          if (!repeatAdvance && sourceTask.dateIdeaId) {
            setDateCompletionTask(sourceTask)
          }
        }),
      )
      return
    }

    if (action === 'retry') {
      const retryDate = getSmartRetryDate(task)
      await runWithTaskMotion(task.id, 'pulse', () => runTaskMutation('retry', task, async () => {
        await actions.updateTask(task.id, {
          isMissed: false,
          status: TASK_STATUS.NOT_STARTED,
          dueDate: retryDate.toISOString(),
          snoozedUntil: null,
          inProgress: false,
          startedAt: null,
          history: appendHistory(task, 'retried', currentUser.id, { dueDate: retryDate.toISOString() }),
        })
        addToast('Task retried', async () => restoreSnapshot(task.id, snapshot))
      }))
      return
    }

    if (action === 'start') {
      if (status === TASK_STATUS.COMPLETED || status === TASK_STATUS.IN_PROGRESS) return
      await runWithTaskMotion(sourceTask.id, 'pulse', () => runTaskMutation('start', sourceTask, async () => {
        await actions.updateTask(sourceTask.id, {
          status: TASK_STATUS.IN_PROGRESS,
          inProgress: true,
          startedAt: now,
          snoozedUntil: null,
          history: appendHistory(sourceTask, task.isBrokenDown ? 'breakdown-started' : 'started', currentUser.id, task.isBrokenDown ? { originalTitle: task.originalTitle } : {}),
        })
        setStartModeTaskId(sourceTask.id)
        setStartTimerSeconds(0)
        addToast(options.source === 'focus' ? 'Started' : buildUndoMessage('start', ''), async () => restoreSnapshot(sourceTask.id, snapshot))
      }))
      return
    }

    if (action === 'stop') {
      if (status !== TASK_STATUS.IN_PROGRESS) return
      const startedAt = toDate(task.startedAt)
      const elapsedMinutes = startedAt ? Math.max(1, Math.round((new Date(now).getTime() - startedAt.getTime()) / 60000)) : 0
      await runWithTaskMotion(task.id, 'pulse', () => runTaskMutation('stop', task, async () => {
        await actions.updateTask(task.id, {
          status: TASK_STATUS.NOT_STARTED,
          inProgress: false,
          startedAt: null,
          trackedMinutes: (task.trackedMinutes ?? 0) + elapsedMinutes,
          history: appendHistory(task, 'stopped', currentUser.id, { elapsedMinutes }),
        })
        if (startModeTaskId === task.id) {
          setStartModeTaskId(null)
          setStartTimerSeconds(0)
        }
        addToast(buildUndoMessage('stop', ''), async () => restoreSnapshot(task.id, snapshot))
      }))
      return
    }

    if (action === 'ack') {
      await runWithTaskMotion(task.id, 'pulse', () => runTaskMutation('ack', task, async () => {
        await actions.updateTask(task.id, {
          acknowledgedAt: now,
          history: appendHistory(task, 'acknowledged', currentUser.id),
        })
        addToast('Got it', async () => restoreSnapshot(task.id, snapshot))
      }))
      return
    }

    if (action === 'reschedule' || action === 'snooze') {
      setActionSheet({ type: action, task: sourceTask, snapshot })
      setCustomDate('')
      return
    }

    if (action === 'skip') {
      const repeatAdvance = shouldAdvanceRepeat(sourceTask) ? advanceRepeatingTask(sourceTask, currentUser.id, now, 'skipped') : null
      await runWithTaskMotion(sourceTask.id, repeatAdvance ? 'pulse' : 'exit', () => runTaskMutation('skip', sourceTask, async () => {
        await actions.updateTask(sourceTask.id, {
          ...(repeatAdvance
            ? {
                dueDate: repeatAdvance.dueDate,
                nextOccurrenceAt: repeatAdvance.nextOccurrenceAt,
                status: repeatAdvance.status,
                snoozedUntil: repeatAdvance.snoozedUntil,
                isCompleted: false,
                wasSkipped: true,
                inProgress: false,
                startedAt: null,
                history: appendHistory(sourceTask, 'repeat-skipped', currentUser.id, { nextDueDate: repeatAdvance.dueDate }),
              }
            : {
                status: TASK_STATUS.COMPLETED,
                isCompleted: true,
                completedAt: now,
                wasSkipped: true,
                inProgress: false,
                startedAt: null,
                history: appendHistory(sourceTask, 'skipped', currentUser.id),
              }),
        })
        addToast(repeatAdvance ? 'Skipped. Next repeat scheduled' : 'Skipped this time', async () => restoreSnapshot(sourceTask.id, snapshot))
      }))
      return
    }

    if (action === 'pause-repeat') {
      await runWithTaskMotion(sourceTask.id, 'pulse', () => runTaskMutation('pause-repeat', sourceTask, async () => {
        await actions.updateTask(sourceTask.id, {
          repeatPausedAt: now,
          repeatType: 'none',
          repeatDays: [],
          nextOccurrenceAt: null,
          history: appendHistory(sourceTask, 'repeat-paused', currentUser.id),
        })
        addToast('Repeat paused', async () => restoreSnapshot(sourceTask.id, snapshot))
      }))
      return
    }

    if (action === 'reopen') {
      await runWithTaskMotion(task.id, 'pulse', () => runTaskMutation('reopen', task, async () => {
        await actions.updateTask(task.id, {
          status: TASK_STATUS.NOT_STARTED,
          isCompleted: false,
          completedAt: null,
          isMissed: false,
          snoozedUntil: null,
          inProgress: false,
          startedAt: null,
          reopenedFromTaskId: task.id,
          history: appendHistory(task, 'reopened', currentUser.id),
        })
        addToast(`Reopened. What's left?`, async () => restoreSnapshot(task.id, snapshot))
      }))
      return
    }

    if (action === 'remove') {
      await runWithTaskMotion(task.id, 'exit', () => runTaskMutation('remove', task, async () => {
        await actions.updateTask(task.id, {
          isMissed: true,
          inProgress: false,
          startedAt: null,
          history: appendHistory(task, 'removed', currentUser.id),
        })
        addToast('Removed from active flow', async () => restoreSnapshot(task.id, snapshot))
      }))
    }
  }

  async function handleSheetSelect(optionId) {
    if (!actionSheet || !currentUser) return
    const { type, task, snapshot } = actionSheet

    if (type === 'snooze') {
      const until = resolveSnoozeUntil(optionId, customDate)
      if (!until) return

      await runWithTaskMotion(task.id, 'exit', () => runTaskMutation(`snooze:${optionId}`, task, async () => {
        await actions.updateTask(task.id, {
          status: TASK_STATUS.SNOOZED,
          snoozedUntil: until.toISOString(),
          inProgress: false,
          startedAt: null,
          snoozeCount: (task.snoozeCount ?? 0) + 1,
          history: appendHistory(task, 'snoozed', currentUser.id, { optionId, until: until.toISOString() }),
        })
        if (startModeTaskId === task.id) {
          setStartModeTaskId(null)
          setStartTimerSeconds(0)
        }
        addToast(
          buildUndoMessage('snooze', optionId === 'custom' ? 'selected date' : ACTION_SNOOZE_OPTIONS.find((option) => option.id === optionId)?.label.toLowerCase() ?? 'later'),
          async () => restoreSnapshot(task.id, snapshot),
        )
      }))
      if (isDateNightTask(task)) clearDateReminderEntry(task.id)
    }

    if (type === 'reschedule') {
      const dueDate = resolveRescheduleDate(optionId, customDate)
      if (!dueDate) return

      await runWithTaskMotion(task.id, 'pulse', () => runTaskMutation(`reschedule:${optionId}`, task, async () => {
        await actions.updateTask(task.id, {
          dueDate: dueDate.toISOString(),
          snoozedUntil: null,
          status: getTaskStatus(task) === TASK_STATUS.COMPLETED ? TASK_STATUS.COMPLETED : TASK_STATUS.NOT_STARTED,
          history: appendHistory(task, 'rescheduled', currentUser.id, { optionId, dueDate: dueDate.toISOString() }),
        })
        addToast(
          buildUndoMessage('reschedule', optionId === 'custom' ? 'selected date' : RESCHEDULE_OPTIONS.find((option) => option.id === optionId)?.label.toLowerCase() ?? 'later'),
          async () => restoreSnapshot(task.id, snapshot),
        )
      }))
      if (isDateNightTask(task)) clearDateReminderEntry(task.id)
    }

    setActionSheet(null)
    setCustomDate('')
  }

  async function handleUndo(toast) {
    if (toast.undo) await toast.undo()
    setToasts((current) => current.filter((item) => item.id !== toast.id))
  }

  async function handleClearToday() {
    if (!currentUser) return
    const todayTasks = filteredTasks.filter((task) => task.urgency === 'Today' && getTaskStatus(task) !== TASK_STATUS.COMPLETED)
    await Promise.all(
      todayTasks.map((task) =>
        actions.updateTask(task.id, {
          dueDate: addDays(toDate(task.dueDate) ?? new Date(), 1).toISOString(),
          history: appendHistory(task, 'clear-today', currentUser.id),
        }),
      ),
    )
    addToast('Today tasks moved to tomorrow', null)
  }

  async function handleWrapUpTomorrow() {
    if (!currentUser) return
    const todayTasks = filteredTasks.filter((task) => task.urgency === 'Today' && getTaskStatus(task) !== TASK_STATUS.COMPLETED)
    await Promise.all(
      todayTasks.map((task) =>
        actions.updateTask(task.id, {
          dueDate: addDays(toDate(task.dueDate) ?? new Date(), 1).toISOString(),
          urgency: 'This week',
          history: appendHistory(task, 'evening-wrap', currentUser.id),
        }),
      ),
    )
    addToast('Today tasks moved to tomorrow', null)
  }

  async function handleKeepTopThree() {
    if (!currentUser) return
    const toPush = filteredTasks
      .filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED && task.id !== sections?.topTask?.id)
      .slice(3)

    await Promise.all(
      toPush.map((task) =>
        actions.updateTask(task.id, {
          urgency: 'This week',
          history: appendHistory(task, 'push-to-week', currentUser.id),
        }),
      ),
    )
    addToast('Kept the top 3 and pushed the rest to this week', null)
  }

  async function handleSimplifyList() {
    setLowEnergyMode(true)
    addToast('Low Energy Mode is on. Quick tasks are leading now.', null)
  }

  async function handleWeeklyReassign(task) {
    if (!currentUser) return
    const nextAssignee = task.assignedTo === currentUser.id ? partner.id : currentUser.id

    await runTaskMutation('reassign', task, async () => {
      await actions.updateTask(task.id, {
        assignedTo: nextAssignee,
        history: appendHistory(task, 'reassigned', currentUser.id, { assignedTo: nextAssignee }),
      })
      addToast(`Reassigned to ${nextAssignee === currentUser.id ? currentUser.name : partner.name}`, null)
    })
  }

  async function handleConvertToRepeat(task) {
    if (!currentUser) return
    const sourceDate = toDate(task.dueDate) ?? new Date()
    const nextOccurrence = addDays(sourceDate, 7).toISOString()

    await runTaskMutation('convert-repeat', task, async () => {
      await actions.updateTask(task.id, {
        repeatType: 'weekly',
        nextOccurrenceAt: nextOccurrence,
        history: appendHistory(task, 'repeat-suggested', currentUser.id, { repeatType: 'weekly' }),
      })
      addToast('Set to repeat weekly', null)
    })
  }

  async function handleRescheduleAllMissed() {
    if (!currentUser) return
    const missedTasks = tasks.filter((task) => task.isMissed)
    if (!missedTasks.length) return

    const nextDate = addDays(new Date(), 1).toISOString()
    await Promise.all(
      missedTasks.map((task) =>
        actions.updateTask(task.id, {
          isMissed: false,
          status: TASK_STATUS.NOT_STARTED,
          dueDate: nextDate,
          history: appendHistory(task, 'rescheduled-from-missed', currentUser.id, { dueDate: nextDate }),
        }),
      ),
    )
    setStatsView(null)
    addToast('Missed tasks moved to tomorrow', null)
  }

  async function handleTaskSave(taskId, updates) {
    if (!currentUser) return undefined
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return undefined

    const duplicateTask = detectDuplicateTask(tasks, { ...task, ...updates }, taskId)
    if (duplicateTask) {
      setDuplicatePrompt({ mode: 'edit', taskId, updates, duplicateTask })
      return { blocked: true }
    }

    await runTaskMutation('save', task, async () => {
      await actions.updateTask(taskId, {
        ...updates,
        history: appendHistory(task, 'edited', currentUser.id),
      })
    })
    addToast('Task updated', null)
    return { blocked: false }
  }

  async function handleGoalSave(value) {
    if (!currentUser || !goalEditor) return

    setGoalSaveBusy(true)
    try {
      await actions.updateUserProfile({
        id: currentUser.id,
        goals: {
          ...goals,
          [goalEditor.key]: value,
        },
      })
      setGoalEditor(null)
      addToast('Goals updated', null)
    } finally {
      setGoalSaveBusy(false)
    }
  }

  async function handleDateCompletionSave(entry) {
    setDateCompletionBusy(true)
    try {
      await actions.createDateHistory(entry)
      if (entry.taskId) {
        updateDateReminderEntry(entry.taskId, { reflectionSavedAt: new Date().toISOString() })
      }
      setDateCompletionTask(null)
      addToast('Date night tracked', null)
    } finally {
      setDateCompletionBusy(false)
    }
  }

  function openDeletePrompt(task) {
    const futureRepeats = (task.repeatType ?? 'none') !== 'none' ? getRelatedFutureRepeats(task, tasks) : []
    setDeletePrompt({
      task,
      futureRepeats,
      mode: futureRepeats.length ? 'repeat' : 'single',
    })
  }

  async function restoreDeletedTasks(snapshots) {
    await Promise.all(snapshots.map((snapshot) => actions.restoreTask(snapshot.id, snapshot)))
  }

  async function handleDeleteTask(scope = 'single') {
    if (!deletePrompt || deleteBusy) return

    const targets = scope === 'future' ? [deletePrompt.task, ...deletePrompt.futureRepeats] : [deletePrompt.task]
    const snapshots = targets.map((item) => ({ ...item }))

    setDeleteBusy(true)
    setDeletePrompt(null)
    setOpenTaskId(null)

    if (targets.some((item) => item.id === startModeTaskId)) {
      setStartModeTaskId(null)
      setStartTimerSeconds(0)
    }

    try {
      targets.forEach((task) => setTaskMotionState(task.id, 'exit'))
      await delay(TASK_MOTION_DURATION)
      await Promise.all(
        targets.map((task) =>
          runTaskMutation(`delete:${scope}`, task, async () => {
            await actions.deleteTask(task.id)
          }),
        ),
      )

      addToast(scope === 'future' ? 'Task series deleted' : 'Task deleted', async () => restoreDeletedTasks(snapshots))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleDuplicateUpdateExisting() {
    if (!duplicatePrompt || !currentUser) return

    const { mode, duplicateTask } = duplicatePrompt
    if (mode === 'create') {
      const { payload } = duplicatePrompt
      await runTaskMutation('duplicate-update', duplicateTask, async () => {
        await actions.updateTask(duplicateTask.id, {
          ...payload,
          clientRequestId: undefined,
          history: appendHistory(duplicateTask, 'updated-from-duplicate', currentUser.id),
        })
      })
      addToast('Updated existing task', null)
      setQuickAddExpanded(false)
    }

    if (mode === 'edit') {
      const { updates } = duplicatePrompt
      await runTaskMutation('duplicate-update', duplicateTask, async () => {
        await actions.updateTask(duplicateTask.id, {
          ...updates,
          history: appendHistory(duplicateTask, 'updated-from-duplicate', currentUser.id),
        })
      })
      addToast('Updated existing task', null)
      setOpenTaskId(duplicateTask.id)
    }

    setDuplicatePrompt(null)
  }

  async function handleDuplicateKeepBoth() {
    if (!duplicatePrompt || !currentUser) return

    if (duplicatePrompt.mode === 'create') {
      await actions.createTask(duplicatePrompt.payload)
      addToast('Task saved', null)
      setQuickAddExpanded(false)
    }

    if (duplicatePrompt.mode === 'edit') {
      const task = tasks.find((item) => item.id === duplicatePrompt.taskId)
      if (task) {
        await actions.updateTask(task.id, {
          ...duplicatePrompt.updates,
          history: appendHistory(task, 'edited', currentUser.id),
        })
        addToast('Task updated', null)
      }
    }

    setDuplicatePrompt(null)
  }

  if (authLoading || loading) {
    return <main className="flex min-h-screen items-center justify-center text-slate-600">Loading Follow Through...</main>
  }

  if (!currentUser) {
    return <AuthScreen usingMockAuth={usingMockAuth} />
  }

  const pageProps = {
    error,
    usingMockData,
    banner,
    stats,
    goals,
    goalProgress,
    focusGoalMessage,
    goalSuggestion,
    dateIdeas,
    dateHistory,
    recentDates,
    repeatHistory,
    topDateIdeas,
    dateNightSummary,
    monthlyDateStatus,
    sections,
    currentUser,
    partner,
    users,
    usersById,
    tasks,
    filteredTasks,
    filterId,
    setFilterId,
    focusMode,
    setFocusMode,
    lowEnergyMode,
    setLowEnergyMode,
    quickAddExpanded,
    setQuickAddExpanded,
    snoozePreset,
    setSnoozePreset,
    snoozeOptions: SNOOZE_OPTIONS,
    notificationStatus,
    onEnableNotifications: handleEnableNotifications,
    onOpenGoalEditor: (goalKey) => setGoalEditor({ key: goalKey }),
    onOpenDateIdeaModal: () => setDateIdeaModalOpen(true),
    onOpenDateNight: () => navigate('/dates'),
    onStartHere: handleStartHere,
    onQuickAdd: handleQuickAdd,
    onCreateDateIdea: handleCreateDateIdea,
    onCreateDateTask: handleCreateDateTask,
    onSelectDateIdea: handleSelectDateIdea,
    onRepeatDateIdea: handleRepeatDateIdea,
    onTaskAction: handleTaskAction,
    onOpenTask: setOpenTaskId,
    taskMotionState: getTaskMotionState,
    onStatsDrilldown: setStatsView,
    onKeepTopThree: handleKeepTopThree,
    onSimplifyList: handleSimplifyList,
    onWeeklyReassign: handleWeeklyReassign,
    onConvertToRepeat: handleConvertToRepeat,
    onClearToday: handleClearToday,
    onWrapUpTomorrow: handleWrapUpTomorrow,
    onSignOut: logout,
  }

  return (
    <>
      <AppShell pageProps={pageProps} />

      {startModeTask ? (
        <section className="fixed inset-0 z-40 bg-ink/60 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto max-w-md rounded-4xl bg-panel p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-accent">Start Mode</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{startModeTask.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{startModeTask.clarity || 'Do the smallest clear version of this now.'}</p>
            <div className="mt-4 rounded-3xl bg-canvas p-4 text-center">
              <p className="text-sm text-slate-500">Focused time</p>
              <p className="mt-1 text-3xl font-semibold text-ink">
                {String(Math.floor(startTimerSeconds / 60)).padStart(2, '0')}:{String(startTimerSeconds % 60).padStart(2, '0')}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={() => handleTaskAction('done', startModeTask)}>
                Complete now
              </button>
              <button className="rounded-3xl bg-white px-4 py-4 font-medium text-slate-700" type="button" onClick={() => handleTaskAction('stop', startModeTask)}>
                <span className="inline-flex items-center gap-2">
                  <TimerReset size={16} /> Stop
                </span>
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {openTask ? (
        <TaskDetailModal
          key={openTask.id}
          task={openTask}
          users={users}
          currentUser={currentUser}
          tasks={tasks}
          onClose={() => setOpenTaskId(null)}
          onSave={(updates) => handleTaskSave(openTask.id, updates)}
          onDelete={() => openDeletePrompt(openTask)}
        />
      ) : null}

      {actionSheet ? (
        <ActionSheetModal
          title={actionSheet.type === 'snooze' ? 'Snooze task' : 'Reschedule task'}
          options={actionSheet.type === 'snooze' ? ACTION_SNOOZE_OPTIONS : RESCHEDULE_OPTIONS}
          customDate={customDate}
          customLabel={actionSheet.type === 'snooze' ? 'Custom snooze date' : 'Custom due date'}
          onCustomDateChange={setCustomDate}
          onClose={() => {
            setActionSheet(null)
            setCustomDate('')
          }}
          onSelect={handleSheetSelect}
        />
      ) : null}

      {statsView ? (
        <StatsDrilldownModal
          view={statsView}
          tasks={tasks}
          stats={stats}
          goals={goals}
          onChangeView={setStatsView}
          onGoFocus={() => {
            setStatsView(null)
            setOpenTaskId(null)
            navigate('/focus')
          }}
          onOpenTask={(taskId) => {
            setStatsView(null)
            setOpenTaskId(taskId)
          }}
          onTaskAction={handleTaskAction}
          onOpenQuickWin={() => {
            const quickWinTask = sections?.quickWinTasks?.[0]
            setStatsView(null)
            if (quickWinTask) {
              setOpenTaskId(quickWinTask.id)
              return
            }
            navigate('/focus')
          }}
          onConvertToRepeat={handleConvertToRepeat}
          onSetTasksFilter={(value) => {
            setStatsView(null)
            setFilterId(value)
            navigate('/tasks')
          }}
          onRescheduleAllMissed={handleRescheduleAllMissed}
          onClose={() => setStatsView(null)}
        />
      ) : null}

      {duplicatePrompt ? (
        <DuplicateTaskModal
          task={duplicatePrompt.duplicateTask}
          onUpdateExisting={handleDuplicateUpdateExisting}
          onKeepBoth={handleDuplicateKeepBoth}
          onCancel={() => setDuplicatePrompt(null)}
        />
      ) : null}

      {deletePrompt ? (
        <ConfirmModal
          title={deletePrompt.mode === 'repeat' ? 'Delete this task?' : `Delete "${deletePrompt.task.title}"?`}
          body={
            deletePrompt.mode === 'repeat'
              ? 'Do you want to delete just this task or all future repeats?'
              : 'This action cannot be undone.'
          }
          actions={
            deletePrompt.mode === 'repeat'
              ? [
                  { label: 'This task only', onClick: () => handleDeleteTask('single'), tone: 'danger' },
                  { label: 'All future', onClick: () => handleDeleteTask('future'), tone: 'primary' },
                  { label: 'Cancel', onClick: () => setDeletePrompt(null), tone: 'default' },
                ]
              : [
                  { label: 'Cancel', onClick: () => setDeletePrompt(null), tone: 'default' },
                  { label: 'Delete', onClick: () => handleDeleteTask('single'), tone: 'danger' },
                ]
          }
          onCancel={() => setDeletePrompt(null)}
          busy={deleteBusy}
        />
      ) : null}

      {activeDateReminderPrompt ? (
        <ConfirmModal
          title="Still on for tonight?"
          body={getDateNightIdeaTitle(activeDateReminderPrompt)}
          actions={[
            {
              label: 'Mark complete',
              onClick: async () => {
                setDateReminderPrompt(null)
                await markDateTaskComplete(activeDateReminderPrompt)
              },
              tone: 'primary',
            },
            {
              label: 'Reschedule',
              onClick: () => handleDateReminderReschedule(activeDateReminderPrompt),
              tone: 'default',
            },
            { label: 'Close', onClick: () => setDateReminderPrompt(null), tone: 'default' },
          ]}
          onCancel={() => setDateReminderPrompt(null)}
        />
      ) : null}

      {activeDateMorningPrompt ? (
        <ConfirmModal
          title="Did date night happen?"
          body={getDateNightIdeaTitle(activeDateMorningPrompt)}
          actions={[
            {
              label: 'Yes',
              onClick: async () => {
                setDateMorningPrompt(null)
                await markDateTaskComplete(activeDateMorningPrompt)
              },
              tone: 'primary',
            },
            {
              label: 'No - reschedule',
              onClick: () => {
                const task = activeDateMorningPrompt
                setDateMorningPrompt(null)
                setActionSheet({ type: 'reschedule', task, snapshot: { ...task } })
                setCustomDate('')
              },
              tone: 'default',
            },
            {
              label: 'Cancel date',
              onClick: () => handleCancelDateTask(activeDateMorningPrompt),
              tone: 'danger',
            },
          ]}
          onCancel={() => setDateMorningPrompt(null)}
        />
      ) : null}

      <ToastStack toasts={toasts} onUndo={handleUndo} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      {goalEditor ? (
        <GoalSettingsModal
          key={`${goalEditor.key}:${goals[goalEditor.key]}`}
          config={{
            ...GOAL_CONFIG[goalEditor.key],
            value: goals[goalEditor.key],
          }}
          onClose={() => setGoalEditor(null)}
          onSave={handleGoalSave}
          busy={goalSaveBusy}
        />
      ) : null}

      {dateIdeaModalOpen ? (
        <DateIdeaModal onClose={() => setDateIdeaModalOpen(false)} onSave={handleCreateDateIdea} busy={dateIdeaSaveBusy} />
      ) : null}

      {dateCompletionTask ? (
        <DateCompletionModal task={dateCompletionTask} onClose={() => setDateCompletionTask(null)} onSave={handleDateCompletionSave} busy={dateCompletionBusy} />
      ) : null}

      {selectedDateIdea ? (
        <ConfirmModal
          title="Date night planned"
          body={selectedDateIdea.title}
          actions={[
            { label: 'Close', onClick: () => setSelectedDateIdea(null), tone: 'default' },
            { label: 'Create task', onClick: () => handleCreateDateTask(selectedDateIdea), tone: 'primary' },
          ]}
          onCancel={() => setSelectedDateIdea(null)}
        />
      ) : null}
    </>
  )
}

export default App
