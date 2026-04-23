import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Filter, Grip, Plus, Search, X } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { SectionCard } from '../components/SectionCard'
import { QuickAddCard } from '../components/QuickAddCard'
import { TaskCard } from '../components/TaskCard'
import { FILTERS, TASK_STATUS } from '../lib/constants'
import { getTaskStatus, isDueWithinHours, isOverdue, isSnoozed, toDate } from '../lib/format'
import { PageHeader } from './PageHeader'

const SEGMENTS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'snoozed', label: 'Snoozed' },
]

const UTILITY_SEGMENTS = [
  { id: 'reprioritize', label: 'Reprioritize', icon: Grip },
  { id: 'checkin', label: 'Check-In', icon: Filter },
  { id: 'deadlines', label: 'Upcoming', icon: CalendarClock },
]
const TASK_UTILITIES_STORAGE_KEY = 'follow-through-tasks-utilities-open'

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

function groupTasks(tasks) {
  const activeTasks = tasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED)
  const snoozedTasks = activeTasks.filter((task) => isSnoozed(task))
  const unsnoozedTasks = activeTasks.filter((task) => !isSnoozed(task))
  const todayTasks = unsnoozedTasks.filter(isTodayBucketTask)
  const upcomingTasks = unsnoozedTasks.filter((task) => !todayTasks.includes(task) && dueWithinDays(task, 7))
  const backlogTasks = unsnoozedTasks.filter((task) => !todayTasks.includes(task) && !upcomingTasks.includes(task))

  return {
    today: todayTasks,
    upcoming: upcomingTasks,
    backlog: backlogTasks,
    snoozed: snoozedTasks,
  }
}

function upcomingSevenDays(tasks) {
  return tasks
    .filter((task) => {
      if (getTaskStatus(task) === TASK_STATUS.COMPLETED || task.isMissed || isSnoozed(task)) return false
      const dueDate = toDate(task.dueDate)
      if (!dueDate) return false
      const days = differenceInCalendarDays(dueDate, new Date())
      return days >= 0 && days <= 7
    })
    .sort((a, b) => (toDate(a.dueDate)?.getTime() ?? Infinity) - (toDate(b.dueDate)?.getTime() ?? Infinity))
    .slice(0, 4)
}

export function TasksPage({
  sections,
  filteredTasks,
  currentUser,
  users,
  usersById,
  tasks,
  filterId,
  setFilterId,
  quickAddExpanded,
  setQuickAddExpanded,
  onQuickAdd,
  onKeepTopThree,
  onSimplifyList,
  onTaskAction,
  onOpenTask,
  taskMotionState,
  onWeeklyReassign,
}) {
  const [activeSegment, setActiveSegment] = useState('today')
  const [utilitySegment, setUtilitySegment] = useState('reprioritize')
  const [utilitiesOpen, setUtilitiesOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(TASK_UTILITIES_STORAGE_KEY) === 'true'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const groupedTasks = useMemo(() => groupTasks(filteredTasks), [filteredTasks])
  const upcomingTasks = useMemo(() => upcomingSevenDays(filteredTasks), [filteredTasks])
  const visibleTasks = useMemo(
    () => (groupedTasks[activeSegment] ?? []).filter((task) => matchesTaskSearch(task, searchQuery)),
    [activeSegment, groupedTasks, searchQuery],
  )
  const visibleUpcomingTasks = useMemo(
    () => upcomingTasks.filter((task) => matchesTaskSearch(task, searchQuery)),
    [searchQuery, upcomingTasks],
  )
  const visibleDraggingTasks = useMemo(
    () => (sections?.draggingTasks ?? []).filter((task) => matchesTaskSearch(task, searchQuery)),
    [searchQuery, sections?.draggingTasks],
  )
  const activeCount = filteredTasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED).length
  const draggingCount = visibleDraggingTasks.length

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    window.localStorage.setItem(TASK_UTILITIES_STORAGE_KEY, String(utilitiesOpen))
    return undefined
  }, [utilitiesOpen])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tasks"
        body="Open the right bucket, then tap a task for details."
        meta={`${activeCount} active asks`}
        actions={
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-slate-600">
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

      <button
        className="flex w-full items-center gap-3 rounded-4xl border border-sand bg-white/95 px-4 py-4 text-left text-slate-500 shadow-sm"
        type="button"
        onClick={() => setQuickAddExpanded(true)}
      >
        <Search size={18} />
        <span className="flex-1">What needs follow-through?</span>
        <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">Add</span>
      </button>

      <label className="flex items-center gap-3 rounded-4xl border border-sand bg-white/95 px-4 py-3 text-slate-500 shadow-sm">
        <Search size={16} />
        <input
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
          type="search"
          placeholder="Search tasks"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {searchQuery ? (
          <button className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600" type="button" onClick={() => setSearchQuery('')}>
            Clear
          </button>
        ) : null}
      </label>

      <div className="grid grid-cols-4 gap-1 rounded-3xl bg-white p-1 shadow-sm">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.id}
            className={`rounded-2xl px-2 py-3 text-xs font-semibold transition ${activeSegment === segment.id ? 'bg-accent text-white' : 'text-slate-600'}`}
            type="button"
            onClick={() => setActiveSegment(segment.id)}
          >
            {segment.label}
          </button>
        ))}
      </div>

      <SectionCard title="Utilities" subtitle="Quick planning without leaving the list.">
        <button
          className="flex w-full items-center justify-between rounded-3xl bg-white px-4 py-3 text-left text-sm font-medium text-slate-700"
          type="button"
          onClick={() => setUtilitiesOpen((current) => !current)}
        >
          <span>{utilitiesOpen ? 'Hide utilities' : 'Show utilities'}</span>
          <span className="text-xs text-slate-500">{draggingCount ? `${draggingCount} need attention` : `${visibleUpcomingTasks.length} upcoming`}</span>
        </button>

        {utilitiesOpen ? (
          <>
            <div className="grid grid-cols-3 gap-1 rounded-3xl bg-white p-1 shadow-sm">
              {UTILITY_SEGMENTS.map((segment) => {
                const Icon = segment.icon
                return (
                  <button
                    key={segment.id}
                    className={`rounded-2xl px-2 py-3 text-xs font-semibold transition ${utilitySegment === segment.id ? 'bg-accent text-white' : 'text-slate-600'}`}
                    type="button"
                    onClick={() => setUtilitySegment(segment.id)}
                  >
                    <span className="flex items-center justify-center gap-1">
                      <Icon size={14} />
                      {segment.label}
                    </span>
                  </button>
                )
              })}
            </div>

            {utilitySegment === 'reprioritize' ? (
              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-3xl bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700" type="button" onClick={onKeepTopThree}>
                  Keep top 3
                </button>
                <button className="rounded-3xl bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700" type="button" onClick={onSimplifyList}>
                  Simplify list
                </button>
              </div>
            ) : null}

            {utilitySegment === 'checkin' ? (
              visibleDraggingTasks.length ? (
                <div className="space-y-3">
                  {visibleDraggingTasks.slice(0, 2).map((task) => (
                    <div key={task.id} className="rounded-3xl bg-white p-3">
                      <button className="text-left font-medium text-ink" type="button" onClick={() => onOpenTask(task.id)}>
                        {task.title}
                      </button>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <button className="rounded-2xl bg-canvas px-3 py-2 text-slate-600" type="button" onClick={() => onTaskAction('reschedule', task)}>
                          Reschedule
                        </button>
                        <button className="rounded-2xl bg-canvas px-3 py-2 text-slate-600" type="button" onClick={() => onTaskAction('remove', task)}>
                          Remove
                        </button>
                        <button className="rounded-2xl bg-canvas px-3 py-2 text-slate-600" type="button" onClick={() => onWeeklyReassign(task)}>
                          Reassign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl bg-white px-4 py-4 text-sm text-slate-500">Nothing is dragging right now.</div>
              )
            ) : null}

            {utilitySegment === 'deadlines' ? (
              visibleUpcomingTasks.length ? (
                <div className="space-y-3">
                  {visibleUpcomingTasks.slice(0, 2).map((task) => (
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
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl bg-white px-4 py-4 text-sm text-slate-500">
                  {searchQuery ? 'No upcoming matches.' : 'No deadlines in the next 7 days.'}
                </div>
              )
            ) : null}
          </>
        ) : null}
      </SectionCard>

      <section className="space-y-3">
        {visibleTasks.length ? (
          visibleTasks.map((task) => (
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
          <div className="rounded-4xl border border-white/70 bg-panel/95 p-5 text-sm text-slate-500 shadow-card">
            <p>{searchQuery ? 'No matching tasks.' : `Nothing in ${SEGMENTS.find((segment) => segment.id === activeSegment)?.label.toLowerCase()} right now.`}</p>
            <button
              className="mt-3 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white"
              type="button"
              onClick={() => setQuickAddExpanded(true)}
            >
              Add a task
            </button>
          </div>
        )}
      </section>

      {quickAddExpanded ? (
        <div className="fixed inset-0 z-40 flex items-end bg-ink/30 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-full w-full overflow-y-auto rounded-4xl bg-canvas shadow-card sm:max-w-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-canvas px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick Add</p>
                <h2 className="text-lg font-semibold text-ink">Capture a task</h2>
              </div>
              <button
                className="rounded-full bg-white p-3 text-slate-600"
                type="button"
                aria-label="Close quick add"
                onClick={() => setQuickAddExpanded(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 pt-0">
              <QuickAddCard
                key={currentUser.id}
                currentUser={currentUser}
                users={users}
                tasks={tasks}
                onSubmit={onQuickAdd}
                expanded
                onExpandedChange={setQuickAddExpanded}
              />
            </div>
          </div>
        </div>
      ) : null}

      <button
        className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-card"
        type="button"
        aria-label="Quick add"
        onClick={() => setQuickAddExpanded(true)}
      >
        <Plus size={24} />
      </button>
    </div>
  )
}
