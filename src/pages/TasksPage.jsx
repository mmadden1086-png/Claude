import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Filter, Search } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { SectionCard } from '../components/SectionCard'
import { QuickAddCard } from '../components/QuickAddCard'
import { TaskCard } from '../components/TaskCard'
import { FILTERS, TASK_STATUS } from '../lib/constants'
import { getTaskStatus, isDueWithinHours, isOverdue, isSnoozed, toDate } from '../lib/format'
import { PageHeader } from './PageHeader'

const SEGMENTS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'snoozed', label: 'Snoozed' },
]
const TASK_UTILITIES_STORAGE_KEY = 'follow-through-tasks-utilities-open'
const TASK_UTILITIES_DISMISSED_STORAGE_KEY = 'follow-through-tasks-utilities-dismissed'

function matchesTaskSearch(task, query) {
  if (!query.trim()) return true
  const normalizedQuery = query.trim().toLowerCase()
  const haystack = [
    task.title,
    task.notes,
    task.category,
    task.clarity,
    task.whyThisMatters,
    task.effort,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalizedQuery)
}

function dueWithinDays(task, days) {
  const dueDate = toDate(task.dueDate)
  if (!dueDate) return false
  const diff = differenceInCalendarDays(dueDate, new Date())
  return diff >= 0 && diff <= days
}

function isTodayBucketTask(task) {
  const dueDate = toDate(task.dueDate)
  if (task.isMissed || isOverdue(task) || isDueWithinHours(task, 0, 24)) return true
  if (!dueDate && task.urgency === 'Today') return true
  return false
}

export function TasksPage({
  selection,
  sections,
  filteredTasks,
  currentUser,
  users,
  usersById,
  tasks,
  filterId,
  setFilterId,
  quickAddExpanded,
  quickAddDefaults,
  setQuickAddExpanded,
  onQuickAdd,
  onTaskAction,
  onOpenTask,
  taskMotionState,
  onWeeklyReassign,
}) {
  const focusTask = selection?.focusTask ?? sections?.focusTask ?? null

  const [activeSegment, setActiveSegment] = useState('all')
  const [quickActionMode, setQuickActionMode] = useState('normal')
  const [utilitiesOpen, setUtilitiesOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(TASK_UTILITIES_STORAGE_KEY) === 'true'
  })
  const [utilitiesDismissed, setUtilitiesDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(TASK_UTILITIES_DISMISSED_STORAGE_KEY) === 'true'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmittingInline, setIsSubmittingInline] = useState(false)

  const allSorted = useMemo(() => selection?.allSorted ?? [], [selection])

  const snoozedTasks = useMemo(
    () => filteredTasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED && isSnoozed(task)),
    [filteredTasks],
  )

  const groupedTasks = useMemo(() => {
    const today = allSorted.filter(isTodayBucketTask)
    const upcoming = allSorted.filter((task) => !today.some((candidate) => candidate.id === task.id) && dueWithinDays(task, 7))
    const backlog = allSorted.filter((task) => !today.some((candidate) => candidate.id === task.id) && !upcoming.some((candidate) => candidate.id === task.id))

    return {
      all: allSorted,
      today,
      upcoming,
      backlog,
      snoozed: snoozedTasks,
    }
  }, [allSorted, snoozedTasks])

  const upcomingTasks = useMemo(() => selection?.upcoming ?? sections?.dueSoonTasks ?? [], [sections, selection])

  const allVisibleTasks = useMemo(
    () => (groupedTasks.all ?? []).filter((task) => matchesTaskSearch(task, searchQuery)),
    [groupedTasks.all, searchQuery],
  )

  const visibleTasks = useMemo(
    () => (groupedTasks[activeSegment] ?? []).filter((task) => matchesTaskSearch(task, searchQuery)),
    [activeSegment, groupedTasks, searchQuery],
  )

  const visibleUpcomingTasks = useMemo(
    () => upcomingTasks.filter((task) => matchesTaskSearch(task, searchQuery)),
    [searchQuery, upcomingTasks],
  )

  const visibleDraggingTasks = useMemo(
    () => (selection?.checkIn ?? selection?.dragging ?? sections?.draggingTasks ?? []).filter((task) => matchesTaskSearch(task, searchQuery)),
    [searchQuery, sections?.draggingTasks, selection],
  )

  const activeCount = filteredTasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED).length
  const totalOpenCount = tasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED).length

  const filterLabel = FILTERS.find((filter) => filter.id === filterId)?.label ?? 'current'
  const noFilterMatches = !searchQuery && filterId !== 'all' && allSorted.length === 0 && totalOpenCount > 0

  const draggingCount = visibleDraggingTasks.length

  const shouldAutoExpandUtilities = draggingCount > 0 || filteredTasks.some((task) => isOverdue(task) && getTaskStatus(task) !== TASK_STATUS.COMPLETED)

  const utilitiesVisible = utilitiesOpen || (shouldAutoExpandUtilities && !utilitiesDismissed)

  const utilitiesSummaryLabel = draggingCount > 0
    ? `${draggingCount} need attention`
    : `${visibleUpcomingTasks.length} coming up`

  const displayTasks = useMemo(() => {
    if (quickActionMode === 'top3') return allVisibleTasks.slice(0, 3)
    if (quickActionMode === 'simplify') return allVisibleTasks.slice(0, 1)
    return visibleTasks
  }, [allVisibleTasks, quickActionMode, visibleTasks])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.localStorage.setItem(TASK_UTILITIES_STORAGE_KEY, String(utilitiesOpen))
    return undefined
  }, [utilitiesOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.localStorage.setItem(TASK_UTILITIES_DISMISSED_STORAGE_KEY, String(utilitiesDismissed))
    return undefined
  }, [utilitiesDismissed])

  async function handleInlineSubmit(event) {
    if (event.key !== 'Enter') return
    if (!searchQuery.trim() || isSubmittingInline) return
    event.preventDefault()
    setIsSubmittingInline(true)
    try {
      const result = await onQuickAdd?.({
        title: searchQuery.trim(),
        notes: '',
        assignedTo: currentUser.id,
        dueDate: '',
        dueTime: '',
        urgency: 'Today',
        effort: 'Quick',
        category: 'Home',
        clarity: '',
        whyThisMatters: '',
        repeatType: 'none',
        repeatDays: [],
      })
      if (!result?.blocked) {
        setSearchQuery('')
      }
    } finally {
      setIsSubmittingInline(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">

          {focusTask && (
            <div className="mb-2">
              <div className="text-xs text-slate-500 mb-1">
                What needs attention
              </div>
              <TaskCard
                task={focusTask}
                currentUser={currentUser}
                usersById={usersById}
                onAction={onTaskAction}
                onOpen={onOpenTask}
                variant="focus"
                showWhy
                showDoneWhen
              />
            </div>
          )}

          <PageHeader
            title="Tasks"
            body="Browse everything or jump into one bucket."
            meta={`${activeCount} active asks`}
            actions={
              <div className="flex flex-wrap items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-slate-600">
                <Filter size={14} />
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className={`rounded-full px-3 py-1 ${filter.id === filterId ? 'bg-accent text-white' : ''}`}
                    type="button"
                    onClick={() => setFilterId(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            }
          />

          {/* rest unchanged */}

          <section className="space-y-2.5">
            {displayTasks.length ? (
              displayTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUser={currentUser}
                  usersById={usersById}
                  onAction={onTaskAction}
                  onOpen={onOpenTask}
                  variant="compact"
                  motionState={taskMotionState?.(task.id)}
                />
              ))
            ) : (
              <div className="rounded-[1.75rem] border border-white/70 bg-panel/95 p-4 text-sm text-slate-500 shadow-card">
                <p>No tasks right now.</p>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
