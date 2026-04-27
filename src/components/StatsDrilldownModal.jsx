import { useMemo, useState } from 'react'
import { differenceInHours, endOfDay, format, isAfter, isBefore, startOfDay, subDays } from 'date-fns'
import { ChevronRight, X } from 'lucide-react'
import { TASK_STATUS } from '../lib/constants'
import { formatDueContext, formatLastHandled, getTaskStatus, toDate } from '../lib/format'

function completedTasks(tasks) {
  return tasks
    .filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED)
    .slice()
    .sort((a, b) => (toDate(b.completedAt)?.getTime() ?? 0) - (toDate(a.completedAt)?.getTime() ?? 0))
}

function missedTasks(tasks) {
  return tasks.filter((task) => task.isMissed)
}

function streakDays(tasks, days = 14) {
  const completed = completedTasks(tasks)
  const doneKeys = new Set(
    completed
      .map((task) => toDate(task.completedAt))
      .filter(Boolean)
      .map((date) => format(date, 'yyyy-MM-dd')),
  )

  return Array.from({ length: days }, (_, index) => {
    const date = subDays(new Date(), days - index - 1)
    const key = format(date, 'yyyy-MM-dd')
    return {
      key,
      label: format(date, 'EEE'),
      day: format(date, 'd'),
      done: doneKeys.has(key),
    }
  })
}

function effortBreakdown(tasks) {
  return ['Quick', 'Medium', 'Heavy'].map((effort) => {
    const matching = completedTasks(tasks).filter((task) => task.effort === effort)
    const average = matching.length
      ? Math.round(
          matching.reduce((sum, task) => {
            const createdAt = toDate(task.createdAt)
            const completedAt = toDate(task.completedAt)
            if (!createdAt || !completedAt) return sum
            return sum + Math.max(0, differenceInHours(completedAt, createdAt))
          }, 0) / matching.length,
        )
      : 0

    return { effort, average, count: matching.length }
  })
}

function slowTasks(tasks) {
  return completedTasks(tasks)
    .map((task) => {
      const createdAt = toDate(task.createdAt)
      const completedAt = toDate(task.completedAt)
      const hours = createdAt && completedAt ? Math.max(0, differenceInHours(completedAt, createdAt)) : 0
      return { task, hours }
    })
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5)
}

function reliabilityByCategory(tasks) {
  const bucket = new Map()

  tasks.forEach((task) => {
    const category = task.category || 'Other'
    const entry = bucket.get(category) ?? { category, onTime: 0, late: 0, missed: 0 }
    const completedAt = toDate(task.completedAt)
    const dueDate = toDate(task.dueDate)

    if (task.isMissed) {
      entry.missed += 1
    } else if (getTaskStatus(task) === TASK_STATUS.COMPLETED) {
      if (!completedAt || !dueDate || completedAt <= dueDate) entry.onTime += 1
      else entry.late += 1
    }

    bucket.set(category, entry)
  })

  return Array.from(bucket.values())
    .filter((item) => item.onTime || item.late || item.missed)
    .sort((a, b) => b.onTime + b.late + b.missed - (a.onTime + a.late + a.missed))
    .slice(0, 6)
}

function sequenceTasks(tasks) {
  return completedTasks(tasks).slice(0, 6)
}

function filterCompleted(tasks, filter) {
  const completed = completedTasks(tasks)
  if (filter === 'all') return completed
  const now = new Date()
  if (filter === 'today') {
    return completed.filter((task) => {
      const completedAt = toDate(task.completedAt)
      return completedAt && isAfter(completedAt, startOfDay(now)) && isBefore(completedAt, endOfDay(now))
    })
  }
  return completed.filter((task) => {
    const completedAt = toDate(task.completedAt)
    return completedAt && isAfter(completedAt, subDays(now, 7))
  })
}

function goalInsights(stats, goals) {
  const today = new Date()
  const weekdayIndex = ((today.getDay() + 6) % 7) + 1
  const expectedByNow = Math.ceil((goals.weeklyCompletion * weekdayIndex) / 7)
  const weeklyGap = expectedByNow - stats.weeklyHandled
  const remainingThisWeek = Math.max(0, goals.weeklyCompletion - stats.weeklyHandled)
  const dailyGap = goals.dailyMinimum - stats.todayHandled
  const reliabilityGap = goals.reliabilityTarget - stats.reliability

  return {
    expectedByNow,
    weeklyGap,
    remainingThisWeek,
    dailyGap,
    reliabilityGap,
    weeklyPercent: goals.weeklyCompletion > 0 ? Math.min(100, Math.round((stats.weeklyHandled / goals.weeklyCompletion) * 100)) : 0,
  }
}

function ModalTaskRow({ task, subtitle, primaryActionLabel, secondaryActionLabel, onPrimaryAction, onSecondaryAction, onOpenTask }) {
  return (
    <article className="rounded-3xl bg-white p-4">
      <button className="w-full text-left" type="button" onClick={() => onOpenTask?.(task.id)}>
        <p className="font-medium text-ink">{task.title}</p>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </button>
      {(onPrimaryAction || onSecondaryAction) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onPrimaryAction ? (
            <button className="flex-1 rounded-2xl bg-accentSoft px-3 py-2 text-sm font-medium text-accent" type="button" onClick={() => onPrimaryAction(task)}>
              {primaryActionLabel}
            </button>
          ) : null}
          {onSecondaryAction ? (
            <button className="flex-1 rounded-2xl bg-canvas px-3 py-2 text-sm font-medium text-slate-700" type="button" onClick={() => onSecondaryAction(task)}>
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function StatsDrilldownModal({
  view,
  tasks,
  stats,
  userGoals: goals,
  onClose,
  onChangeView,
  onGoFocus,
  onOpenTask,
  onTaskAction,
  onOpenQuickWin,
  onSetTasksFilter,
  onRescheduleAllMissed,
}) {
  const [completedFilter, setCompletedFilter] = useState(view?.filter ?? 'all')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const recentStreak = useMemo(() => streakDays(tasks, 14), [tasks])
  const completionSequence = useMemo(() => sequenceTasks(tasks), [tasks])
  const avgByEffort = useMemo(() => effortBreakdown(tasks), [tasks])
  const categoryInsights = useMemo(() => reliabilityByCategory(tasks), [tasks])
  const filteredCompleted = useMemo(() => filterCompleted(tasks, completedFilter), [tasks, completedFilter])
  const missed = useMemo(() => missedTasks(tasks), [tasks])
  const slowestTasks = useMemo(() => slowTasks(tasks), [tasks])
  const goalState = useMemo(() => goalInsights(stats, goals), [goals, stats])
  const selectedCategoryTasks = useMemo(
    () =>
      selectedCategory
        ? tasks.filter((task) => task.category === selectedCategory && (getTaskStatus(task) === TASK_STATUS.COMPLETED || task.isMissed))
        : [],
    [selectedCategory, tasks],
  )

  const titleMap = {
    completed: 'Completed tasks',
    streak: 'Days with follow-through',
    sequence: 'Tasks in a row',
    'avg-time': 'Average completion time',
    reliability: 'Reliability breakdown',
    goals: 'Goal progress',
    missed: 'Missed tasks',
    'partner-activity': 'Partner activity',
  }

  return (
    <section className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink">{titleMap[view?.type] ?? 'Stats'}</h2>
          <button className="rounded-full bg-white p-3 text-slate-600" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {view?.type === 'completed' ? (
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-2 rounded-3xl bg-canvas p-1">
              {['today', 'week', 'all'].map((filter) => (
                <button
                  key={filter}
                  className={`rounded-2xl px-3 py-2 text-sm font-medium ${completedFilter === filter ? 'bg-accent text-white' : 'text-slate-600'}`}
                  type="button"
                  onClick={() => setCompletedFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter === 'week' ? 'Week' : 'Today'}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {filteredCompleted.length ? (
                filteredCompleted.map((task) => (
                  <ModalTaskRow
                    key={task.id}
                    task={task}
                    subtitle={formatLastHandled(task) ?? 'Tracked in history'}
                    primaryActionLabel="Reopen"
                    secondaryActionLabel="Do again"
                    onPrimaryAction={(target) => onTaskAction?.('reopen', target)}
                    onSecondaryAction={(target) => onTaskAction?.('duplicate', target)}
                    onOpenTask={onOpenTask}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">No completed tasks in this window.</p>
              )}
            </div>
          </div>
        ) : null}

        {view?.type === 'goals' ? (
          <div className="mt-4 space-y-4">
            {view.focus === 'weekly' ? (
              <>
                <div className="rounded-3xl bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <p className="font-medium text-slate-700">Weekly completion goal</p>
                    <p className="text-slate-600">
                      {stats.weeklyHandled} / {goals.weeklyCompletion}
                    </p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${goalState.weeklyPercent}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-3xl bg-white p-4">
                    <p className="text-2xl font-semibold text-accent">{goalState.expectedByNow}</p>
                    <p className="mt-1 text-xs text-slate-600">Expected by now</p>
                  </div>
                  <div className="rounded-3xl bg-white p-4">
                    <p className="text-2xl font-semibold text-accent">{goalState.remainingThisWeek}</p>
                    <p className="mt-1 text-xs text-slate-600">Left this week</p>
                  </div>
                </div>
                <div className="rounded-3xl bg-white p-4 text-sm text-slate-600">
                  {goalState.weeklyGap <= 0
                    ? 'You are on pace for the week.'
                    : goalState.weeklyGap === 1
                      ? 'You are one task behind pace right now.'
                      : `You are ${goalState.weeklyGap} tasks behind pace right now.`}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={onGoFocus}>
                    Go to Focus
                  </button>
                  <button
                    className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700"
                    type="button"
                    onClick={() => {
                      onChangeView?.({ type: 'completed', filter: 'week' })
                    }}
                  >
                    View completed tasks
                  </button>
                </div>
              </>
            ) : null}

            {view.focus === 'daily' ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-3xl bg-accentSoft p-4">
                    <p className="text-2xl font-semibold text-accent">{stats.todayHandled}</p>
                    <p className="mt-1 text-xs text-slate-600">Handled today</p>
                  </div>
                  <div className="rounded-3xl bg-accentSoft p-4">
                    <p className="text-2xl font-semibold text-accent">{goals.dailyMinimum}</p>
                    <p className="mt-1 text-xs text-slate-600">Daily minimum</p>
                  </div>
                </div>
                <div className="rounded-3xl bg-white p-4 text-sm text-slate-600">
                  {goalState.dailyGap <= 0
                    ? 'Today is already covering your minimum.'
                    : goalState.dailyGap === 1
                      ? 'One more task today keeps the streak on track.'
                      : `${goalState.dailyGap} more tasks today will cover your minimum.`}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={onGoFocus}>
                    Go to Focus
                  </button>
                  <button
                    className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700"
                    type="button"
                    onClick={() => onOpenQuickWin?.()}
                  >
                    Do a quick win
                  </button>
                </div>
              </>
            ) : null}

            {view.focus === 'reliability' ? (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-3xl bg-accentSoft p-3">
                    <p className="text-2xl font-semibold text-accent">{stats.reliability}%</p>
                    <p className="text-xs text-slate-600">Current</p>
                  </div>
                  <div className="rounded-3xl bg-accentSoft p-3">
                    <p className="text-2xl font-semibold text-accent">{goals.reliabilityTarget}%</p>
                    <p className="text-xs text-slate-600">Target</p>
                  </div>
                  <div className="rounded-3xl bg-accentSoft p-3">
                    <p className="text-2xl font-semibold text-accent">{Math.abs(goalState.reliabilityGap)}%</p>
                    <p className="text-xs text-slate-600">{goalState.reliabilityGap <= 0 ? 'Ahead' : 'Gap'}</p>
                  </div>
                </div>
                <div className="rounded-3xl bg-white p-4 text-sm text-slate-600">
                  {goalState.reliabilityGap <= 0
                    ? 'Reliability is at or above your target.'
                    : `You are ${goalState.reliabilityGap}% below your reliability target.`}
                </div>
                <div className="space-y-3">
                  {categoryInsights.map((item) => (
                    <button
                      key={item.category}
                      className={`w-full rounded-3xl bg-white p-4 text-left ${selectedCategory === item.category ? 'ring-2 ring-accent/30' : ''}`}
                      type="button"
                      onClick={() => setSelectedCategory(item.category)}
                    >
                      <p className="font-medium text-ink">{item.category}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.onTime} on-time - {item.late} late - {item.missed} missed
                      </p>
                    </button>
                  ))}
                </div>
                {selectedCategory && selectedCategory !== '__slow__' ? (
                  <div className="space-y-3">
                    {selectedCategoryTasks.length ? (
                      selectedCategoryTasks.map((task) => (
                        <ModalTaskRow key={task.id} task={task} subtitle={formatLastHandled(task) ?? formatDueContext(task)} onOpenTask={onOpenTask} />
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No tasks in this category yet.</p>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {view?.type === 'streak' ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-7 gap-2">
              {recentStreak.map((day) => (
                <div key={day.key} className={`rounded-2xl p-2 text-center ${day.done ? 'bg-accentSoft text-accent' : 'bg-canvas text-slate-500'}`}>
                  <p className="text-[0.65rem] font-semibold uppercase">{day.label}</p>
                  <p className="mt-1 text-sm font-semibold">{day.day}</p>
                </div>
              ))}
            </div>
            <button className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={onGoFocus}>
              Go to Focus
            </button>
          </div>
        ) : null}

        {view?.type === 'sequence' ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-3">
              {completionSequence.length ? (
                completionSequence.map((task, index) => (
                  <article key={task.id} className="rounded-3xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">#{index + 1}</p>
                    <p className="mt-1 font-medium text-ink">{task.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatLastHandled(task)}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-500">No recent completion sequence yet.</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={onGoFocus}>
                Continue streak
              </button>
              <button className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700" type="button" onClick={onOpenQuickWin}>
                Do another quick win
              </button>
            </div>
          </div>
        ) : null}

        {view?.type === 'avg-time' ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {avgByEffort.map((item) => (
                <div key={item.effort} className="rounded-3xl bg-accentSoft p-3">
                  <p className="text-xl font-semibold text-accent">{item.average}h</p>
                  <p className="mt-1 text-xs text-slate-600">{item.effort}</p>
                  <p className="text-[0.7rem] text-slate-500">{item.count} tasks</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={onOpenQuickWin}>
                Trigger Quick Win
              </button>
              <button
                className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700"
                type="button"
                onClick={() => setSelectedCategory('__slow__')}
              >
                View slow tasks
              </button>
            </div>
            {selectedCategory === '__slow__' ? (
              <div className="space-y-3">
                {slowestTasks.length ? (
                  slowestTasks.map(({ task, hours }) => (
                    <ModalTaskRow
                      key={task.id}
                      task={task}
                      subtitle={`Handled in ${hours}h`}
                      onOpenTask={onOpenTask}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No slower tasks to surface yet.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {view?.type === 'reliability' ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-3xl bg-accentSoft p-3">
                <p className="text-2xl font-semibold text-accent">{stats.onTimeCount}</p>
                <p className="text-xs text-slate-600">On-time</p>
              </div>
              <div className="rounded-3xl bg-accentSoft p-3">
                <p className="text-2xl font-semibold text-accent">{stats.lateCount}</p>
                <p className="text-xs text-slate-600">Late</p>
              </div>
              <div className="rounded-3xl bg-accentSoft p-3">
                <p className="text-2xl font-semibold text-accent">{stats.missedCount}</p>
                <p className="text-xs text-slate-600">Missed</p>
              </div>
            </div>
            <div className="space-y-3">
              {categoryInsights.map((item) => (
                <button
                  key={item.category}
                  className={`w-full rounded-3xl bg-white p-4 text-left ${selectedCategory === item.category ? 'ring-2 ring-accent/30' : ''}`}
                  type="button"
                  onClick={() => setSelectedCategory(item.category)}
                >
                  <p className="font-medium text-ink">{item.category}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.onTime} on-time - {item.late} late - {item.missed} missed
                  </p>
                </button>
              ))}
            </div>
            {selectedCategory && selectedCategory !== '__slow__' ? (
              <div className="space-y-3">
                {selectedCategoryTasks.length ? (
                  selectedCategoryTasks.map((task) => (
                    <ModalTaskRow key={task.id} task={task} subtitle={formatLastHandled(task) ?? formatDueContext(task)} onOpenTask={onOpenTask} />
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No tasks in this category yet.</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {view?.type === 'missed' ? (
          <div className="mt-4 space-y-4">
            {missed.length ? (
              <>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white"
                    type="button"
                    onClick={onRescheduleAllMissed}
                  >
                    Reschedule all
                  </button>
                  <button
                    className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700"
                    type="button"
                    onClick={() => missed[0] && onOpenTask?.(missed[0].id)}
                  >
                    Review one by one
                  </button>
                </div>
                <div className="space-y-3">
                  {missed.map((task) => (
                    <ModalTaskRow
                      key={task.id}
                      task={task}
                      subtitle={formatDueContext(task) ?? 'Tracked in history'}
                      primaryActionLabel="Reschedule"
                      onPrimaryAction={(target) => onTaskAction?.('reschedule', target)}
                      onOpenTask={onOpenTask}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-3xl bg-canvas p-4 text-sm text-slate-600">
                <p className="font-medium text-ink">No missed tasks right now.</p>
                <p className="mt-1">Stay with the current top task or head back to Focus.</p>
                <button className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 font-medium text-slate-700" type="button" onClick={onGoFocus}>
                  Go to Focus <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        ) : null}

        {view?.type === 'partner-activity' ? (
          <div className="mt-4 space-y-4">
            {view.tasks?.length ? (
              <>
                <div className="rounded-3xl bg-canvas p-4 text-sm text-slate-600">
                  {view.tasks.length} task{view.tasks.length === 1 ? '' : 's'} from your partner still need a look.
                </div>
                <div className="space-y-3">
                  {view.tasks.map((task) => (
                    <ModalTaskRow key={task.id} task={task} subtitle={formatDueContext(task)} onOpenTask={onOpenTask} />
                  ))}
                </div>
                <button className="w-full rounded-3xl bg-accent px-4 py-4 font-semibold text-white" type="button" onClick={() => onSetTasksFilter?.('partner')}>
                  Review
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-500">No partner tasks to review right now.</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
