import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionCard } from '../components/SectionCard'
import { StatsCard } from '../components/StatsCard'
import { TaskCard } from '../components/TaskCard'
import { TASK_STATUS } from '../lib/constants'
import { formatLastHandled, getTaskStatus, isOverdue, toDate } from '../lib/format'
import { PageHeader } from './PageHeader'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'fairness', label: 'Balance' },
  { id: 'history', label: 'History' },
]

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

function eventTime(entry) {
  return toDate(entry.createdAt ?? entry.updatedAt ?? entry.completedAt ?? entry.date ?? entry.nextDueDate)?.getTime() ?? 0
}

function repeatStatusLabel(entry) {
  if (entry.type === 'repeat-advanced') return 'Moved forward'
  if (entry.type === 'repeat-skipped') return 'Skipped this round'
  return 'Ready again'
}

function repeatNextDueLabel(entry) {
  const nextDue = toDate(entry.nextDueDate)
  if (!nextDue) return 'Next date not set'
  return `Next: ${nextDue.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function sortPartnerTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const aOverdue = isOverdue(a) ? 0 : 1
    const bOverdue = isOverdue(b) ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    const aDue = toDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bDue = toDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return aDue - bDue
  })
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
  taskMotionState,
}) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')

  const unreadPartnerTasks = useMemo(
    () => sortPartnerTasks(filteredTasks.filter((task) => task.requestedBy === partner?.id && !task.acknowledgedAt)),
    [filteredTasks, partner?.id],
  )
  const draggingTasks = sections?.draggingTasks ?? []
  const repeatSuggestions = sections?.repeatSuggestions ?? []
  const dateIdeasById = Object.fromEntries((dateIdeas ?? []).map((idea) => [idea.id, idea]))
  const lastCheckInDate = toDate(currentUser.checkIn?.lastCompletedAt ?? currentUser.lastCheckInAt)
  const lastDateNight = dateNightSummary.lastDate

  const repeatCycleItems = useMemo(() => {
    const latestByTask = new Map()
    ;(repeatHistory ?? []).forEach((entry) => {
      const key = entry.taskId ?? entry.taskTitle
      if (!key) return
      const current = latestByTask.get(key)
      if (!current || eventTime(entry) >= eventTime(current)) latestByTask.set(key, entry)
    })
    return [...latestByTask.values()].sort((a, b) => eventTime(b) - eventTime(a))
  }, [repeatHistory])

  const fairnessData = useMemo(() => {
    const completed = tasks.filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
    const myCount = completed.filter((t) => t.assignedTo === currentUser.id).length
    const partnerCount = completed.filter((t) => t.assignedTo === partner?.id).length
    const total = myCount + partnerCount || 1
    const myPercent = Math.round((myCount / total) * 100)
    const partnerPercent = 100 - myPercent

    const CATEGORIES = ['Home', 'Health', 'Finance', 'Admin', 'Kids', 'Relationship', 'Work', 'Personal']
    const byCategory = CATEGORIES.map((cat) => {
      const catTasks = completed.filter((t) => t.category === cat)
      const mine = catTasks.filter((t) => t.assignedTo === currentUser.id).length
      const theirs = catTasks.filter((t) => t.assignedTo === partner?.id).length
      return { cat, mine, theirs, total: mine + theirs }
    }).filter((row) => row.total > 0)

    return { myCount, partnerCount, myPercent, partnerPercent, byCategory }
  }, [tasks, currentUser.id, partner?.id])

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <PageHeader
            title="Activity"
            body="Track record, recent motion, and shared activity."
            meta={`${stats.totalCompleted} completed · ${stats.reliability}% reliability`}
          />

          {unreadPartnerTasks.length ? (
            <button
              className="w-full rounded-[2rem] border border-accent/20 bg-accentSoft p-4 text-left shadow-sm transition duration-150 active:scale-[0.99]"
              type="button"
              onClick={() => onStatsDrilldown?.({ type: 'partner-activity', tasks: unreadPartnerTasks })}
            >
              <p className="text-sm font-semibold text-accent">
                {partner?.name ?? 'Your partner'} added {unreadPartnerTasks.length} thing{unreadPartnerTasks.length === 1 ? '' : 's'} that need a decision
              </p>
              <p className="mt-1 text-sm text-slate-600">Review the oldest or most urgent items first.</p>
            </button>
          ) : null}

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

          {activeTab === 'fairness' ? (
            <>
              <SectionCard title="Household load" subtitle="Who's been carrying what, based on completed tasks.">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{currentUser.name}</span>
                      <span className="text-slate-500">{fairnessData.myCount} tasks ({fairnessData.myPercent}%)</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-canvas">
                      <div className="h-2.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${fairnessData.myPercent}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{partner?.name ?? 'Partner'}</span>
                      <span className="text-slate-500">{fairnessData.partnerCount} tasks ({fairnessData.partnerPercent}%)</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-canvas">
                      <div className="h-2.5 rounded-full bg-gold transition-all duration-500" style={{ width: `${fairnessData.partnerPercent}%` }} />
                    </div>
                  </div>
                </div>

                {fairnessData.byCategory.length ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">By category</p>
                    {fairnessData.byCategory.map(({ cat, mine, theirs, total }) => {
                      const myPct = Math.round((mine / total) * 100)
                      return (
                        <div key={cat} className="rounded-2xl bg-canvas px-3 py-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-ink">{cat}</span>
                            <span className="text-slate-500">{mine} / {theirs}</span>
                          </div>
                          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white">
                            <div className="h-1.5 bg-accent transition-all duration-500" style={{ width: `${myPct}%` }} />
                            <div className="h-1.5 bg-gold transition-all duration-500" style={{ width: `${100 - myPct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    <p className="px-1 text-xs text-slate-400">
                      <span className="inline-block h-2 w-2 rounded-full bg-accent" /> {currentUser.name}
                      &nbsp;&nbsp;<span className="inline-block h-2 w-2 rounded-full bg-gold" /> {partner?.name ?? 'Partner'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No completed tasks to compare yet.</p>
                )}
              </SectionCard>

              <SectionCard title="Open tasks" subtitle="What's still in each person's queue.">
                {(() => {
                  const open = tasks.filter((t) => getTaskStatus(t) !== TASK_STATUS.COMPLETED && !t.isMissed)
                  const myOpen = open.filter((t) => t.assignedTo === currentUser.id).length
                  const partnerOpen = open.filter((t) => t.assignedTo === partner?.id).length
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-3xl bg-canvas p-4">
                        <p className="text-2xl font-semibold text-accent">{myOpen}</p>
                        <p className="mt-1 text-xs text-slate-600">{currentUser.name}'s open tasks</p>
                      </div>
                      <div className="rounded-3xl bg-canvas p-4">
                        <p className="text-2xl font-semibold text-gold">{partnerOpen}</p>
                        <p className="mt-1 text-xs text-slate-600">{partner?.name ?? 'Partner'}'s open tasks</p>
                      </div>
                    </div>
                  )
                })()}
              </SectionCard>
            </>
          ) : null}

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
                      Go to Tasks
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

              <SectionCard title="Repeat cycles" subtitle="Latest recurring state only.">
                {repeatCycleItems.length ? (
                  <>
                    <div className="space-y-2">
                      {repeatCycleItems.slice(0, 3).map((entry) => (
                        <button
                          key={entry.taskId ?? entry.id}
                          className="w-full rounded-2xl bg-canvas px-4 py-3 text-left transition duration-150 active:scale-[0.99]"
                          type="button"
                          onClick={() => entry.taskId && onOpenTask(entry.taskId)}
                        >
                          <p className="line-clamp-1 text-sm font-semibold text-ink">{entry.taskTitle}</p>
                          <p className="mt-1 text-xs text-slate-600">{repeatStatusLabel(entry)} · {repeatNextDueLabel(entry)}</p>
                        </button>
                      ))}
                    </div>
                    {repeatCycleItems.length > 3 ? (
                      <button
                        className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700"
                        type="button"
                        onClick={() => navigate('/tasks')}
                      >
                        View all recurring
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-3xl bg-white p-4 text-sm text-slate-500">
                    <p>No repeat history yet.</p>
                    <button className="mt-3 rounded-2xl bg-accentSoft px-3 py-2 text-sm font-medium text-accent" type="button" onClick={() => navigate('/tasks')}>
                      Review tasks
                    </button>
                  </div>
                )}
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
