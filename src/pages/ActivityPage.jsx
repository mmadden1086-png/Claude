import { useNavigate } from 'react-router-dom'
import { SectionCard } from '../components/SectionCard'
import { StatsCard } from '../components/StatsCard'
import { TaskCard } from '../components/TaskCard'
import { formatLastHandled, toDate } from '../lib/format'
import { PageHeader } from './PageHeader'

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
  const unreadPartnerTasks = filteredTasks.filter((task) => task.requestedBy === partner.id && !task.acknowledgedAt)
  const draggingTasks = sections?.draggingTasks ?? []
  const repeatSuggestions = sections?.repeatSuggestions ?? []
  const dateIdeasById = Object.fromEntries((dateIdeas ?? []).map((idea) => [idea.id, idea]))
  const lastCheckInDate = toDate(currentUser.checkIn?.lastCompletedAt ?? currentUser.lastCheckInAt)
  const lastDateNight = dateNightSummary.lastDate

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
            meta={`${stats.totalCompleted} completed - ${stats.reliability}% reliability`}
          />

      <div>
        <button
          className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
          type="button"
          onClick={() => onStatsDrilldown?.({ type: 'goals', focus: 'reliability' })}
        >
          Improve reliability
        </button>
      </div>

      <StatsCard currentUser={currentUser} partner={partner} stats={stats} goals={goals} goalProgress={goalProgress} onDrilldown={handleDrilldown} />

      <SectionCard title="Relationship" subtitle="What should you do next? Keep the shared rhythm visible.">
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
          <button className="rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]" type="button" onClick={() => navigate('/tasks')}>
            Review check-in
          </button>
          <button className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={onOpenDateNight}>
            Plan date night
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Recently handled" subtitle="What should you do next? Reopen one or repeat what worked.">
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

      <SectionCard title="Completed timeline" subtitle="What should you do next? Reopen or do one again.">
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
            <p>Completed tasks will show here once something gets handled.</p>
            <button className="mt-3 rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white" type="button" onClick={onStartHere}>
              Start with one
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Date Nights"
        subtitle="What should you do next? Repeat a good date or plan the next one."
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
            <p className="mt-1 text-xs text-slate-600">Months with a date completed</p>
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
                  {entry.rating}/5 rating{entry.wouldRepeat ? ' - would repeat' : ''}
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

      <SectionCard
        title="Missed"
        subtitle="What should you do next? Review or reschedule the tasks that slipped."
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

      <SectionCard title="Repeat cycles" subtitle="What should you do next? Review the next recurring task.">
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
                {entry.type === 'repeat-advanced' ? 'Advanced to next occurrence' : entry.type === 'repeat-skipped' ? 'Skipped forward to next occurrence' : 'Reactivated for the next cycle'}
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

      <SectionCard title="Partner activity" subtitle={`What should you do next? Review what ${partner.name} added.`}>
        <button
          className="w-full rounded-3xl bg-canvas p-4 text-left text-sm text-slate-600 transition duration-150 active:scale-[0.99]"
          type="button"
          onClick={() => onStatsDrilldown?.({ type: 'partner-activity', tasks: unreadPartnerTasks })}
        >
          {unreadPartnerTasks.length ? `${partner.name} added ${unreadPartnerTasks.length} item${unreadPartnerTasks.length === 1 ? '' : 's'} - quick look?` : `No unread asks from ${partner.name} right now.`}
          {unreadPartnerTasks.length ? <span className="mt-3 inline-flex rounded-2xl bg-white px-3 py-2 font-medium text-slate-700">Review</span> : null}
        </button>
      </SectionCard>

      <SectionCard title="Insights" subtitle="What should you do next? Fix friction or convert repeats.">
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
        </div>
      </div>
    </div>
  )
}
