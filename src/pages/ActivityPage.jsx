import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays } from 'date-fns'
import { SectionCard } from '../components/SectionCard'
import { StatsCard } from '../components/StatsCard'
import { TaskCard } from '../components/TaskCard'
import { BOTH_ASSIGNEE_ID, TASK_STATUS } from '../lib/constants'
import { fetchCheckInTaskSuggestions } from '../lib/check-in-ai'
import { formatLastHandled, getTaskStatus, isOverdue, toDate } from '../lib/format'
import { PageHeader } from './PageHeader'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'history', label: 'History' },
]

function isCompletedWithinDays(task, days) {
  const completedAt = toDate(task.completedAt)
  if (!completedAt) return false
  return differenceInCalendarDays(new Date(), completedAt) <= days
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

function ActionRow({ task, subtitle, onOpenTask, actions }) {
  return (
    <div className="space-y-2">
      <TaskCard task={task} currentUser={actions.currentUser} usersById={actions.usersById} onAction={actions.onTaskAction} onOpen={onOpenTask} motionState={actions.taskMotionState?.(task.id)} />
      <div className="grid grid-cols-2 gap-2">
        {actions.buttons.map((button) => (
          <button
            key={button.label}
            className={`rounded-2xl px-3 py-3 text-sm font-medium ${button.tone === 'primary' ? 'bg-accentSoft text-accent' : 'bg-white text-slate-700'}`}
            type="button"
            onClick={() => button.onClick(task)}
          >
            {button.label}
          </button>
        ))}
      </div>
      {subtitle ? <p className="px-1 text-xs text-slate-500">{subtitle}</p> : null}
    </div>
  )
}

export function ActivityPage({
  sections,
  stats,
  goals,
  goalProgress,
  dateIdeas,
  recentDates,
  repeatHistory,
  topDateIdeas,
  dateNightSummary,
  currentUser,
  partner,
  tasks,
  filteredTasks,
  usersById,
  onStatsDrilldown,
  onTaskAction,
  onOpenTask,
  setFilterId,
  onConvertToRepeat,
  onRepeatDateIdea,
  onOpenDateNight,
  onStartHere,
  onCheckInComplete,
  onQuickAdd,
  taskMotionState,
}) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [checkInSuggestions, setCheckInSuggestions] = useState([])
  const [checkInSuggestionsBusy, setCheckInSuggestionsBusy] = useState(false)
  const [addedSuggestionTitles, setAddedSuggestionTitles] = useState([])

  const checkInActive = activeTab === 'checkin'

  const unreadPartnerTasks = filteredTasks.filter((task) => task.requestedBy === partner.id && !task.acknowledgedAt)
  const draggingTasks = sections?.draggingTasks ?? []
  const repeatSuggestions = sections?.repeatSuggestions ?? []
  const dateIdeasById = Object.fromEntries((dateIdeas ?? []).map((idea) => [idea.id, idea]))
  const lastCheckInDate = toDate(currentUser.checkIn?.lastCompletedAt ?? currentUser.lastCheckInAt)
  const lastDateNight = dateNightSummary.lastDate

  const completedLastWeek = useMemo(
    () => (tasks ?? []).filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED && isCompletedWithinDays(task, 7)).slice(0, 4),
    [tasks],
  )
  const overdueTasks = useMemo(
    () => filteredTasks.filter((task) => isOverdue(task) && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [filteredTasks],
  )
  const partnerTasks = useMemo(
    () => filteredTasks.filter((task) => task.requestedBy && task.requestedBy !== currentUser.id && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [filteredTasks, currentUser.id],
  )
  const discussionTasks = useMemo(() => {
    const seen = new Set()
    return filteredTasks
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
  }, [filteredTasks, currentUser.id])

  useEffect(() => {
    if (!checkInActive) return undefined
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
  }, [checkInActive, completedLastWeek, currentUser, discussionTasks, overdueTasks, partner, partnerTasks])

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

  function handleDrilldown(view) {
    if (view?.type === 'open') {
      navigate('/tasks')
      return
    }

    if (view?.type === 'user-filter') {
      setFilterId?.(view.value)
      return
    }

    onStatsDrilldown?.(view)
  }

  const sharedActions = {
    currentUser,
    usersById,
    onTaskAction,
    taskMotionState,
  }

  // ── Check-in prep content (shared between Overview toggle and Check-in tab) ──
  const checkInPrepContent = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs discussion</p>
          <div className="mt-2 space-y-2">
            {discussionTasks.length ? discussionTasks.map((task) => compactTaskRow(task, onOpenTask)) : <p className="text-sm text-slate-500">Nothing needs a conversation.</p>}
          </div>
        </div>
      </div>

      {lastDateNight ? (
        <div className="rounded-3xl bg-accentSoft p-3 text-sm text-accent">
          <p className="font-semibold">Last date night</p>
          <p>{dateIdeasById[lastDateNight.ideaId]?.title ?? lastDateNight.taskTitle ?? 'Date night'}{lastDateNight.rating ? ` — ${lastDateNight.rating}/5` : ''}</p>
          {lastDateNight.notes ? <p className="mt-1 text-xs text-accent/80">{lastDateNight.notes}</p> : null}
        </div>
      ) : null}

      <div className="rounded-3xl bg-white p-3 ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI suggested tasks</p>
          {checkInSuggestionsBusy ? <span className="text-xs text-slate-500">Loading suggestions…</span> : null}
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
                    className={`mt-3 rounded-2xl px-3 py-2 text-xs font-semibold transition duration-150 active:scale-[0.98] ${added ? 'bg-white text-slate-400' : 'bg-accent text-white'}`}
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

      {draggingTasks.length ? (
        <div className="space-y-3">
          {draggingTasks.slice(0, 2).map((task) => (
            <div key={task.id} className="rounded-3xl bg-canvas p-3">
              <button className="text-left font-medium text-ink" type="button" onClick={() => onOpenTask(task.id)}>
                {task.title}
              </button>
              {task._surfaceReason ? <p className="mt-1 text-xs text-slate-500">{task._surfaceReason}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onTaskAction('reschedule', task)}>
                  Reschedule
                </button>
                <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onTaskAction('remove', task)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl bg-canvas px-4 py-4 text-sm text-slate-500">Nothing is dragging right now.</div>
      )}

      <button
        className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
        type="button"
        onClick={onCheckInComplete}
      >
        Complete check-in
      </button>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <PageHeader
            title="Activity"
            body="Track record, recent motion, and shared activity."
            meta={`${stats.totalCompleted} completed · ${stats.reliability}% reliability`}
          />

          <div className="grid grid-cols-3 gap-1 rounded-3xl bg-white p-1 shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`rounded-2xl px-2 py-3 text-xs font-semibold transition ${activeTab === tab.id ? 'bg-accent text-white' : 'text-slate-600'}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Overview tab ──────────────────────────────────────────────── */}
          {activeTab === 'overview' ? (
            <>
              <button
                className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                type="button"
                onClick={() => onStatsDrilldown?.({ type: 'goals', focus: 'reliability' })}
              >
                Improve reliability
              </button>

              <StatsCard currentUser={currentUser} partner={partner} stats={stats} goals={goals} goalProgress={goalProgress} onDrilldown={handleDrilldown} />

              <SectionCard title="Relationship" subtitle="Keep the shared rhythm visible.">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-canvas p-4">
                    <p className="text-sm font-semibold text-ink">{lastCheckInDate ? lastCheckInDate.toLocaleDateString() : 'Not yet'}</p>
                    <p className="mt-1 text-xs text-slate-600">Last check-in</p>
                  </div>
                  <div className="rounded-3xl bg-canvas p-4">
                    <p className="text-sm font-semibold text-ink">{lastDateNight ? (dateIdeasById[lastDateNight.ideaId]?.title ?? 'Date night') : 'Not yet'}</p>
                    <p className="mt-1 text-xs text-slate-600">Last date night</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={() => setActiveTab('checkin')}
                  >
                    Start check-in
                  </button>
                  <button className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={onOpenDateNight}>
                    Plan date night
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                title="Missed"
                subtitle="Review or reschedule the tasks that slipped."
                action={(
                  <button
                    className="rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={() => onStatsDrilldown?.({ type: 'missed' })}
                  >
                    Fix missed tasks
                  </button>
                )}
              >
                <div className="rounded-3xl bg-canvas p-4">
                  <p className="text-2xl font-semibold text-accent">{stats.missedCount}</p>
                  <p className="mt-1 text-sm text-slate-600">{stats.missedCount ? 'Tasks still need recovery' : 'Nothing is missed right now'}</p>
                </div>
              </SectionCard>

              <SectionCard title="Insights" subtitle="Fix friction or convert repeats.">
                <div className="space-y-3 text-sm">
                  <button
                    className="w-full rounded-3xl bg-canvas p-4 text-left transition duration-150 active:scale-[0.99]"
                    type="button"
                    onClick={() => draggingTasks[0] && onOpenTask(draggingTasks[0].id)}
                  >
                    <p className="text-2xl font-semibold text-accent">{draggingTasks.length}</p>
                    <p className="mt-1 text-slate-600">Tasks need cleanup</p>
                    {draggingTasks[0] ? (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">{draggingTasks[0].title}</span>
                        <span className="rounded-2xl bg-white px-3 py-2 font-medium text-slate-700">Fix</span>
                      </div>
                    ) : null}
                  </button>

                  <button
                    className="w-full rounded-3xl bg-canvas p-4 text-left transition duration-150 active:scale-[0.99]"
                    type="button"
                    onClick={() => repeatSuggestions[0] && onConvertToRepeat(repeatSuggestions[0])}
                  >
                    <p className="text-2xl font-semibold text-accent">{repeatSuggestions.length}</p>
                    <p className="mt-1 text-slate-600">Repeat candidates</p>
                    {repeatSuggestions[0] ? (
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">{repeatSuggestions[0].title}</span>
                        <span className="rounded-2xl bg-white px-3 py-2 font-medium text-slate-700">Convert to repeat</span>
                      </div>
                    ) : null}
                  </button>
                </div>
              </SectionCard>
            </>
          ) : null}

          {/* ── Check-in tab ──────────────────────────────────────────────── */}
          {activeTab === 'checkin' ? (
            <SectionCard title="Check-in prep" subtitle="Review what to bring into your next check-in.">
              {checkInPrepContent}
            </SectionCard>
          ) : null}

          {/* ── History tab ───────────────────────────────────────────────── */}
          {activeTab === 'history' ? (
            <>
              <SectionCard title="Recently handled" subtitle="Reopen one or repeat what worked.">
                {sections?.recentlyHandled.length ? (
                  sections.recentlyHandled.map((task) => (
                    <ActionRow
                      key={task.id}
                      task={task}
                      subtitle={formatLastHandled(task)}
                      onOpenTask={onOpenTask}
                      actions={{
                        ...sharedActions,
                        buttons: [
                          { label: 'Reopen', tone: 'primary', onClick: (target) => onTaskAction('reopen', target) },
                          { label: 'Repeat', tone: 'default', onClick: onConvertToRepeat },
                        ],
                      }}
                    />
                  ))
                ) : (
                  <div className="rounded-3xl bg-white p-4 text-sm text-slate-500">
                    <p>No recent completions yet.</p>
                    <button className="mt-3 rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white" type="button" onClick={onStartHere}>
                      Go to Focus
                    </button>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Completed" subtitle="Reopen or do one again.">
                {sections?.completed.length ? (
                  sections.completed.map((task) => (
                    <ActionRow
                      key={task.id}
                      task={task}
                      subtitle={formatLastHandled(task)}
                      onOpenTask={onOpenTask}
                      actions={{
                        ...sharedActions,
                        buttons: [
                          { label: 'Reopen', tone: 'primary', onClick: (target) => onTaskAction('reopen', target) },
                          { label: 'Do again', tone: 'default', onClick: (target) => onTaskAction('duplicate', target) },
                        ],
                      }}
                    />
                  ))
                ) : (
                  <div className="rounded-3xl bg-white p-4 text-sm text-slate-500">
                    <p>Completed tasks will appear here.</p>
                    <button className="mt-3 rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white" type="button" onClick={onStartHere}>
                      Start with one
                    </button>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Date Nights"
                subtitle="Repeat a good date or plan the next one."
                action={(
                  <button className="rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]" type="button" onClick={onOpenDateNight}>
                    Plan a date night
                  </button>
                )}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl bg-canvas p-4">
                    <p className="text-2xl font-semibold text-accent">{dateNightSummary.totalThisMonth}</p>
                    <p className="mt-1 text-xs text-slate-600">Dates this month</p>
                  </div>
                  <div className="rounded-3xl bg-canvas p-4">
                    <p className="text-2xl font-semibold text-accent">{dateNightSummary.averageRatingThisMonth}</p>
                    <p className="mt-1 text-xs text-slate-600">Avg rating</p>
                  </div>
                  <div className="rounded-3xl bg-canvas p-4">
                    <p className="text-sm font-semibold text-ink">{dateNightSummary.lastDate ? (dateIdeasById[dateNightSummary.lastDate.ideaId]?.title ?? 'Date night') : 'None yet'}</p>
                    <p className="mt-1 text-xs text-slate-600">Last date night</p>
                  </div>
                  <div className="rounded-3xl bg-canvas p-4">
                    <p className="text-2xl font-semibold text-accent">{dateNightSummary.monthsWithCompletion}</p>
                    <p className="mt-1 text-xs text-slate-600">Months with a date</p>
                  </div>
                </div>

                {topDateIdeas?.length ? (
                  <div className="space-y-3">
                    {topDateIdeas.map((entry) => (
                      <div key={entry.idea.id} className="rounded-3xl bg-white p-4">
                        <p className="font-medium text-ink">{entry.idea.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{entry.rating.toFixed(1)}/5 average</p>
                        <button className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onRepeatDateIdea(entry.idea)}>
                          Do again
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {recentDates?.length ? (
                  recentDates.map((entry) => {
                    const idea = dateIdeasById[entry.ideaId]
                    return (
                      <div key={entry.id} className="rounded-3xl bg-white p-4">
                        <p className="font-medium text-ink">{idea?.title ?? entry.taskTitle ?? 'Date night'}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {entry.rating}/5 rating{entry.wouldRepeat ? ' · would repeat' : ''}
                        </p>
                        {entry.notes ? <p className="mt-2 text-sm text-slate-500">{entry.notes}</p> : null}
                        {idea ? (
                          <button className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onRepeatDateIdea(idea)}>
                            Do again
                          </button>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-3xl bg-white p-4 text-sm text-slate-500">
                    <p>No date nights tracked yet.</p>
                    <button className="mt-3 rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white" type="button" onClick={onOpenDateNight}>
                      Plan a date night
                    </button>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Repeat cycles" subtitle="Review the next recurring task.">
                {repeatHistory?.length ? (
                  repeatHistory.map((entry) => (
                    <button
                      key={entry.id}
                      className="w-full rounded-3xl bg-canvas p-4 text-left"
                      type="button"
                      onClick={() => onOpenTask(entry.taskId)}
                    >
                      <p className="font-medium text-ink">{entry.taskTitle}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {entry.type === 'repeat-advanced' ? 'Advanced to next occurrence' : entry.type === 'repeat-skipped' ? 'Skipped to next occurrence' : 'Reactivated for the next cycle'}
                      </p>
                      {entry.nextDueDate ? <p className="mt-1 text-xs text-slate-500">Next due {new Date(entry.nextDueDate).toLocaleDateString()}</p> : null}
                    </button>
                  ))
                ) : (
                  <div className="rounded-3xl bg-white p-4 text-sm text-slate-500">
                    <p>No repeat history yet.</p>
                    <button className="mt-3 rounded-2xl bg-accentSoft px-3 py-2 text-sm font-medium text-accent" type="button" onClick={() => navigate('/tasks')}>
                      Review tasks
                    </button>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Partner activity" subtitle={`What ${partner.name} added recently.`}>
                <button
                  className="w-full rounded-3xl bg-canvas p-4 text-left text-sm text-slate-600 transition duration-150 active:scale-[0.99]"
                  type="button"
                  onClick={() => onStatsDrilldown?.({ type: 'partner-activity', tasks: unreadPartnerTasks })}
                >
                  {unreadPartnerTasks.length
                    ? `${partner.name} added ${unreadPartnerTasks.length} item${unreadPartnerTasks.length === 1 ? '' : 's'} — quick look?`
                    : `No unread asks from ${partner.name} right now.`}
                  {unreadPartnerTasks.length ? <span className="mt-3 inline-flex rounded-2xl bg-white px-3 py-2 font-medium text-slate-700">Review</span> : null}
                </button>
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
