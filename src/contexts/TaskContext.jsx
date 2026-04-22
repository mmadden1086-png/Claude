import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { addDays, startOfDay, nextMonday } from 'date-fns'
import { useAuth } from './AuthContext'
import {
  subscribeToTasks,
  addTask as dbAddTask,
  updateTask as dbUpdateTask,
  completeTask as dbCompleteTask,
  uncompleteTask as dbUncompleteTask,
  snoozeTask as dbSnoozeTask,
  unsnoozeTask as dbUnsnoozeTask,
  acknowledgeTask as dbAcknowledgeTask,
  deleteTask as dbDeleteTask,
  updateUserPoints,
  repeatTaskExists,
} from '../lib/firestore'
import { generateNextRepeatDate } from '../utils/repeatLogic'

const TaskContext = createContext(null)

export const useTasks = () => {
  const ctx = useContext(TaskContext)
  if (!ctx) throw new Error('useTasks must be used inside TaskProvider')
  return ctx
}

const EFFORT_POINTS = { Quick: 1, Medium: 2, Heavy: 3 }

const SNOOZE_PRESETS = {
  '1h': () => addDays(new Date(), 0.042),
  tonight: () => {
    const d = new Date()
    d.setHours(20, 0, 0, 0)
    if (d <= new Date()) d.setDate(d.getDate() + 1)
    return d
  },
  tomorrow: () => addDays(startOfDay(new Date()), 1),
  'next-week': () => nextMonday(startOfDay(new Date())),
}

export const SNOOZE_OPTIONS = [
  { key: '1h', label: '1 hour' },
  { key: 'tonight', label: 'Tonight (8 pm)' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'next-week', label: 'Next week' },
]

export const getSnoozeDate = (key) => SNOOZE_PRESETS[key]?.() ?? null

export const TaskProvider = ({ children }) => {
  const { currentUser } = useAuth()
  const [tasks, setTasks] = useState([])
  const [toasts, setToasts] = useState([])
  const undoRegistry = useRef({})

  // Real-time task subscription
  useEffect(() => {
    if (!currentUser) {
      setTasks([])
      return
    }
    const unsub = subscribeToTasks(setTasks)
    return unsub
  }, [currentUser])

  // ─── Toast system ───────────────────────────────────────────────────────────

  const showToast = useCallback((message, undoKey = null, undoFn = null) => {
    const id = `${Date.now()}-${Math.random()}`
    if (undoKey && undoFn) undoRegistry.current[undoKey] = undoFn

    setToasts((prev) => [...prev, { id, message, undoKey }])

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      if (undoKey) delete undoRegistry.current[undoKey]
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const triggerUndo = useCallback((undoKey) => {
    const fn = undoRegistry.current[undoKey]
    if (fn) {
      fn()
      delete undoRegistry.current[undoKey]
    }
    setToasts((prev) => prev.filter((t) => t.undoKey !== undoKey))
  }, [])

  // ─── Task actions ────────────────────────────────────────────────────────────

  const addTask = useCallback(
    async (data) => {
      if (!currentUser) return
      const id = await dbAddTask({
        requestedBy: currentUser.uid,
        assignedTo: currentUser.uid,
        repeatType: 'none',
        repeatDays: [],
        ...data,
      })
      return id
    },
    [currentUser]
  )

  const completeTask = useCallback(
    async (task) => {
      if (!currentUser) return
      const points = EFFORT_POINTS[task.effort] ?? 1

      await dbCompleteTask(task.id)
      await updateUserPoints(currentUser.uid, points, points)

      // Generate repeat occurrence only on completion
      if (task.repeatType && task.repeatType !== 'none') {
        const nextDate = generateNextRepeatDate(task)
        if (nextDate) {
          const exists = await repeatTaskExists(task.title, task.assignedTo, nextDate)
          if (!exists) {
            await dbAddTask({
              title: task.title,
              notes: task.notes,
              assignedTo: task.assignedTo,
              requestedBy: task.requestedBy,
              dueDate: nextDate,
              dueTime: task.dueTime,
              urgency: task.urgency,
              effort: task.effort,
              category: task.category,
              clarity: task.clarity,
              whyThisMatters: task.whyThisMatters,
              repeatType: task.repeatType,
              repeatDays: task.repeatDays,
            })
          }
        }
      }

      showToast(
        `Handled. +${points} pt${points !== 1 ? 's' : ''}`,
        `undo-complete-${task.id}`,
        async () => {
          await dbUncompleteTask(task.id)
          await updateUserPoints(currentUser.uid, -points, -points)
        }
      )
    },
    [currentUser, showToast]
  )

  const snoozeTask = useCallback(
    async (task, snoozeKey) => {
      const until = getSnoozeDate(snoozeKey)
      if (!until) return
      const prevSnoozed = task.snoozedUntil

      await dbSnoozeTask(task.id, until)

      showToast(
        'Snoozed.',
        `undo-snooze-${task.id}`,
        async () => {
          if (prevSnoozed) await dbSnoozeTask(task.id, prevSnoozed)
          else await dbUnsnoozeTask(task.id)
        }
      )
    },
    [showToast]
  )

  const acknowledgeTask = useCallback(async (taskId) => {
    await dbAcknowledgeTask(taskId)
  }, [])

  const skipRepeat = useCallback(
    async (task) => {
      // Complete without generating the next occurrence
      const points = EFFORT_POINTS[task.effort] ?? 1
      await dbUpdateTask(task.id, {
        isCompleted: true,
        completedAt: new Date(),
        // Clear repeat so generateNext is not called
      })
      await updateUserPoints(currentUser.uid, points, points)
      showToast('Skipped this time.', null, null)
    },
    [currentUser, showToast]
  )

  const pauseRepeat = useCallback(
    async (taskId) => {
      await dbUpdateTask(taskId, { repeatType: 'none', repeatDays: [] })
      showToast('Repeat paused.', null, null)
    },
    [showToast]
  )

  const moveToTomorrow = useCallback(
    async (task) => {
      const tomorrow = addDays(startOfDay(new Date()), 1)
        .toISOString()
        .split('T')[0]
      const prev = task.dueDate
      await dbUpdateTask(task.id, { dueDate: tomorrow })
      showToast(
        'Moved to tomorrow.',
        `undo-move-${task.id}`,
        async () => {
          await dbUpdateTask(task.id, { dueDate: prev })
        }
      )
    },
    [showToast]
  )

  const rescheduleTask = useCallback(
    async (task, newDate) => {
      const prev = task.dueDate
      await dbUpdateTask(task.id, { dueDate: newDate })
      showToast(
        'Rescheduled.',
        `undo-reschedule-${task.id}`,
        async () => {
          await dbUpdateTask(task.id, { dueDate: prev })
        }
      )
    },
    [showToast]
  )

  const deleteTask = useCallback(
    async (taskId) => {
      await dbDeleteTask(taskId)
      showToast('Task removed.', null, null)
    },
    [showToast]
  )

  const updateTask = useCallback(async (taskId, updates) => {
    await dbUpdateTask(taskId, updates)
  }, [])

  return (
    <TaskContext.Provider
      value={{
        tasks,
        toasts,
        dismissToast,
        triggerUndo,
        addTask,
        completeTask,
        snoozeTask,
        acknowledgeTask,
        skipRepeat,
        pauseRepeat,
        moveToTomorrow,
        rescheduleTask,
        updateTask,
        deleteTask,
      }}
    >
      {children}
    </TaskContext.Provider>
  )
}
