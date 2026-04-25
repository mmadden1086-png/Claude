import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Filter, Search, X } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { SectionCard } from '../components/SectionCard'
import { QuickAddCard } from '../components/QuickAddCard'
import { TaskCard } from '../components/TaskCard'
import { BOTH_ASSIGNEE_ID, FILTERS, TASK_STATUS } from '../lib/constants'
import { fetchCheckInTaskSuggestions } from '../lib/check-in-ai'
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

function isCompletedWithinDays(task, days) {
  const completedAt = toDate(task.completedAt)
  if (!completedAt) return false
  const diff = differenceInCalendarDays(new Date(), completedAt)
  return diff >= 0 && diff <= days
}

function isOverdueByDays(task, days) {
  const dueDate = toDate(task.dueDate)
  if (!dueDate) return false
  return differenceInCalendarDays(new Date(), dueDate) > days
}

function compactTaskRow(task, onOpenTask) {
  return (
    <button key={task.id} className="w-full rounded-2xl bg-canvas px-3 py-2 text-left text-sm text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenTask(task.id)}>
      {task.title}
    </button>
  )
}

export function TasksPage({
  selection,
  sections,
  filteredTasks,
  currentUser,
  partner,
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
  onCheckInComplete,
  checkInPrepOpenToken,
  recentDates,
  dateIdeas,
}) {
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
  const [dismissedCheckInPrepToken, setDismissedCheckInPrepToken] = useState(0)
  const [checkInSuggestions, setCheckInSuggestions] = useState([])
  const [checkInSuggestionsBusy, setCheckInSuggestionsBusy] = useState(false)
  const [addedSuggestionTitles, setAddedSuggestionTitles] = useState([])
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
  const completedLastWeek = useMemo(
    () => tasks.filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED && isCompletedWithinDays(task, 7)).slice(0, 4),
    [tasks],
  )
  const overdueTasks = useMemo(
    () => allVisibleTasks.filter((task) => isOverdue(task) && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [allVisibleTasks],
  )
  const partnerTasks = useMemo(
    () => allVisibleTasks.filter((task) => task.requestedBy && task.requestedBy !== currentUser.id && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [allVisibleTasks, currentUser.id],
  )
  const discussionTasks = useMemo(() => {
    const seen = new Set()
    return allVisibleTasks
      .filter((task) => {
        const status = getTaskStatus(task)
        const partnerUntouched = task.requestedBy && task.requestedBy !== currentUser.id && !task.acknowledgedAt && !task.startedAt
        return status !== TASK_STATUS.COMPLETED && (isOverdueByDays(task, 3) || partnerUntouched)
      })
      .filter((task) => {
        if (seen.has(task.id)) return false
        seen.add(task.id)
        return true
      })
      .slice(0, 4)
  }, [allVisibleTasks, currentUser.id])
  const dateIdeasById = useMemo(() => Object.fromEntries((dateIdeas ?? []).map((idea) => [idea.id, idea])), [dateIdeas])
  const lastDateNight = recentDates?.[0] ?? null
  const activeCount = filteredTasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED).length
  const totalOpenCount = tasks.filter((task) => getTaskStatus(task) !== TASK_STATUS.COMPLETED).length
  const filterLabel = FILTERS.find((filter) => filter.id === filterId)?.label ?? 'current'
  const noFilterMatches = !searchQuery && filterId !== 'all' && activeCount === 0 && totalOpenCount > 0
  const draggingCount = visibleDraggingTasks.length
  const shouldAutoExpandUtilities = draggingCount > 0 || filteredTasks.some((task) => isOverdue(task) && getTaskStatus(task) !== TASK_STATUS.COMPLETED)
  const checkInPrepForcedOpen = Boolean(checkInPrepOpenToken) && dismissedCheckInPrepToken !== checkInPrepOpenToken
  const utilitiesVisible = utilitiesOpen || checkInPrepForcedOpen || (shouldAutoExpandUtilities && !utilitiesDismissed)
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

  useEffect(() => {
    if (!utilitiesVisible) return undefined
    const abortController = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setCheckInSuggestionsBusy(true)
      try {
        const suggestions = await fetchCheckInTaskSuggestions(
          {
            currentUser,
            partner,
            completedTasks: completedLastWeek,
            overdueTasks,
            partnerTasks,
            discussionTasks,
          },
          abortController.signal,
        )
        if (!abortController.signal.aborted) setCheckInSuggestions(suggestions)
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn('AI check-in task suggestions failed.', error)
          if (!abortController.signal.aborted) setCheckInSuggestions([])
        }
      } finally {
        if (!abortController.signal.aborted) setCheckInSuggestionsBusy(false)
      }
    }, 300)

    return () => {
      abortController.abort()
      window.clearTimeout(timeoutId)
    }
  }, [completedLastWeek, currentUser, discussionTasks, overdueTasks, partner, partnerTasks, utilitiesVisible])

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

  function resolveSuggestionAssignee(value) {
    if (value === 'currentUser') return currentUser.id
    if (value === 'partner') return partner?.id ?? BOTH_ASSIGNEE_ID
    if (value === 'both') return BOTH_ASSIGNEE_ID
    return value || BOTH_ASSIGNEE_ID
  }

  async function handleAddCheckInSuggestion(suggestion) {
    const result = await onQuickAdd?.({
      title: suggestion.title,
      notes: suggestion.reason || '',
      assignedTo: resolveSuggestionAssignee(suggestion.assignedTo),
      dueDate: '',
      dueTime: '',
      urgency: 'This week',
      effort: ['Quick', 'Medium', 'Heavy'].includes(suggestion.effort) ? suggestion.effort : 'Quick',
      category: suggestion.category || 'Home',
      clarity: suggestion.doneWhen || '',
      whyThisMatters: suggestion.why || suggestion.reason || '',
      repeatType: 'none',
      repeatDays: [],
    })
    if (!result?.blocked) {
      setAddedSuggestionTitles((current) => [...current, suggestion.title])
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
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

          <label className="flex items-center gap-3 rounded-[1.75rem] border border-sand bg-white/95 px-4 py-3 text-slate-500 shadow-sm">
            <Search size={16} />
            <input
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
              type="search"
              placeholder="Add or find a task"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleInlineSubmit}
            />
            {searchQuery ? (
              <button className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => setSearchQuery('')}>
                Clear
              </button>
            ) : (
              <button className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => setQuickAddExpanded(true)}>
                Add
              </button>
            )}
          </label>

          <div className="grid grid-cols-5 gap-1 rounded-3xl bg-white p-1 shadow-sm">
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

          <div className="mb-4">
            <SectionCard title="Quick actions" subtitle="Use these only when you need them.">
              <button
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-3xl bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
                type="button"
                onClick={() => {
                  if (utilitiesVisible) {
                    setUtilitiesOpen(false)
                    setUtilitiesDismissed(true)
                    setDismissedCheckInPrepToken(checkInPrepOpenToken ?? 0)
                    return
                  }
                  setUtilitiesOpen(true)
                  setUtilitiesDismissed(false)
                }}
              >
                <span>{utilitiesVisible ? 'Hide quick actions' : utilitiesSummaryLabel}</span>
                <span className="text-xs text-slate-500">{utilitiesSummaryLabel}</span>
              </button>

              {utilitiesVisible ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`min-w-[10rem] flex-1 rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${quickActionMode === 'top3' ? 'bg-accent text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
                      type="button"
                      onClick={() => setQuickActionMode((current) => (current === 'top3' ? 'normal' : 'top3'))}
                    >
                      {quickActionMode === 'top3' ? 'Done' : 'Keep top 3'}
                    </button>
                    <button
                      className={`min-w-[10rem] flex-1 rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${quickActionMode === 'simplify' ? 'bg-accent text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
                      type="button"
                      onClick={() => setQuickActionMode((current) => (current === 'simplify' ? 'normal' : 'simplify'))}
                    >
                      {quickActionMode === 'simplify' ? 'Done' : 'Simplify list'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-3xl bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">Check-in prep</p>
                          <p className="text-xs text-slate-500">This is what you'll walk into the check-in with</p>
                        </div>
                        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600">{draggingCount}</span>
                      </div>
                      <div className="mb-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-3xl bg-white p-3 ring-1 ring-slate-100">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</p>
                          <div className="mt-2 space-y-2">
                            {completedLastWeek.length ? completedLastWeek.map((task) => compactTaskRow(task, onOpenTask)) : <p className="text-sm text-slate-500">Nothing completed this week yet.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-white p-3 ring-1 ring-slate-100">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue</p>
                          <div className="mt-2 space-y-2">
                            {overdueTasks.length ? overdueTasks.map((task) => compactTaskRow(task, onOpenTask)) : <p className="text-sm text-slate-500">No overdue tasks.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-white p-3 ring-1 ring-slate-100">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Partner tasks</p>
                          <div className="mt-2 space-y-2">
                            {partnerTasks.length ? partnerTasks.map((task) => compactTaskRow(task, onOpenTask)) : <p className="text-sm text-slate-500">No partner asks waiting.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-white p-3 ring-1 ring-slate-100">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What needs discussion</p>
                          <div className="mt-2 space-y-2">
                            {discussionTasks.length ? discussionTasks.map((task) => compactTaskRow(task, onOpenTask)) : <p className="text-sm text-slate-500">Nothing needs a conversation.</p>}
                          </div>
                        </div>
                      </div>
                      {lastDateNight ? (
                        <div className="mb-3 rounded-3xl bg-accentSoft p-3 text-sm text-accent">
                          <p className="font-semibold">Last date night</p>
                          <p>{dateIdeasById[lastDateNight.ideaId]?.title ?? lastDateNight.taskTitle ?? 'Date night'}{lastDateNight.rating ? ` - ${lastDateNight.rating}/5` : ''}</p>
                          {lastDateNight.notes ? <p className="mt-1 text-xs text-accent/80">{lastDateNight.notes}</p> : null}
                        </div>
                      ) : null}
                      <div className="mb-3 rounded-3xl bg-white p-3 ring-1 ring-slate-100">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI suggested tasks</p>
                          {checkInSuggestionsBusy ? <span className="text-xs text-slate-500">Thinking...</span> : null}
                        </div>
                        <div className="mt-2 space-y-2">
                          {checkInSuggestions.length ? (
                            checkInSuggestions.map((suggestion) => {
                              const added = addedSuggestionTitles.includes(suggestion.title)
                              return (
                                <div key={suggestion.title} className="rounded-2xl bg-canvas p-3">
                                  <p className="text-sm font-medium text-ink">{suggestion.title}</p>
                                  {suggestion.reason ? <p className="mt-1 text-xs text-slate-500">{suggestion.reason}</p> : null}
                                  <button
                                    className={`mt-3 rounded-2xl px-3 py-2 text-xs font-semibold transition duration-150 active:scale-[0.98] ${added ? 'bg-white text-slate-500' : 'bg-accent text-white'}`}
                                    type="button"
                                    disabled={added}
                                    onClick={() => handleAddCheckInSuggestion(suggestion)}
                                  >
                                    {added ? 'Added' : 'Add task'}
                                  </button>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-sm text-slate-500">
                              {checkInSuggestionsBusy ? 'Looking for useful next steps.' : 'No AI suggestions needed right now.'}
                            </p>
                          )}
                        </div>
                      </div>
                      {visibleDraggingTasks.length ? (
                        <div className="space-y-3">
                          {visibleDraggingTasks.slice(0, 2).map((task) => (
                            <div key={task.id} className="rounded-3xl bg-canvas p-3">
                              <button className="text-left font-medium text-ink" type="button" onClick={() => onOpenTask(task.id)}>
                                {task.title}
                              </button>
                              {task._surfaceReason ? <p className="mt-1 text-xs text-slate-500">{task._surfaceReason}</p> : null}
                              <div className="mt-3 flex gap-2 flex-wrap text-xs">
                                <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onTaskAction('reschedule', task)}>
                                  Reschedule
                                </button>
                                <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onTaskAction('remove', task)}>
                                  Remove
                                </button>
                                <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onWeeklyReassign(task)}>
                                  Reassign
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-3xl bg-canvas px-4 py-4 text-sm text-slate-500">Nothing is dragging right now.</div>
                      )}
                      <button
                        className="mt-3 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                        type="button"
                        onClick={onCheckInComplete}
                      >
                        Mark check-in complete
                      </button>
                    </div>

                    <div className="rounded-3xl bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CalendarClock size={16} className="text-slate-500" />
                          <div>
                            <p className="text-sm font-semibold text-ink">Upcoming deadlines</p>
                            <p className="text-xs text-slate-500">Due in the next 7 days.</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600">{visibleUpcomingTasks.length}</span>
                      </div>
                      {visibleUpcomingTasks.length ? (
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
                        <div className="rounded-3xl bg-canvas px-4 py-4 text-sm text-slate-500">
                          {searchQuery ? 'No upcoming matches.' : 'No deadlines in the next 7 days.'}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </SectionCard>
          </div>

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
                <p>
                  {noFilterMatches
                    ? `No tasks match ${filterLabel} filter.`
                    : searchQuery
                      ? 'No matching tasks.'
                      : quickActionMode !== 'normal'
                        ? 'No tasks match this quick action view.'
                        : `Nothing in ${SEGMENTS.find((segment) => segment.id === activeSegment)?.label.toLowerCase()} right now.`}
                </p>
                {noFilterMatches ? (
                  <button
                    className="mt-3 text-sm font-semibold text-accent underline-offset-4 transition hover:underline"
                    type="button"
                    onClick={() => setFilterId('all')}
                  >
                    Clear filter
                  </button>
                ) : null}
                {quickActionMode !== 'normal' ? (
                  <button
                    className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={() => setQuickActionMode('normal')}
                  >
                    Return to normal view
                  </button>
                ) : null}
                <button
                  className="mt-3 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                  type="button"
                  onClick={() => setQuickAddExpanded(true)}
                >
                  Add a task
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {quickAddExpanded ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 px-4 py-4 backdrop-blur-sm">
          <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-4xl bg-canvas shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-canvas px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quick Add</p>
                <h2 className="text-lg font-semibold text-ink">Capture a task</h2>
              </div>
              <button
                className="rounded-full bg-white p-3 text-slate-600 transition duration-150 active:scale-[0.98]"
                type="button"
                aria-label="Close quick add"
                onClick={() => setQuickAddExpanded(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-0">
              <QuickAddCard
                key={`${currentUser.id}:${JSON.stringify(quickAddDefaults ?? {})}`}
                currentUser={currentUser}
                users={users}
                tasks={tasks}
                defaults={quickAddDefaults}
                onSubmit={onQuickAdd}
                expanded
                onExpandedChange={setQuickAddExpanded}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
