import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionCard } from '../components/SectionCard'
import { StatsCard } from '../components/StatsCard'
import { TaskCard } from '../components/TaskCard'
import { TASK_STATUS } from '../lib/constants'
import { formatLastHandled, getTaskStatus, isOverdue, toDate } from '../lib/format'
import { PageHeader } from './PageHeader'

const TABS = [
  { id: 'overview', label: 'Overview' },
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

  const unreadPartnerTasks = filteredTasks.filter((task) => task.requestedBy === partner.id && !task.acknowledgedAt)
  const draggingTasks = sections?.draggingTasks ?? []
  const repeatSuggestions = sections?.repeatSuggestions ?? []
  const dateIdeasById = Object.fromEntries((dateIdeas ?? []).map((idea) => [idea.id, idea]))
  const lastCheckInDate = toDate(currentUser.checkIn?.lastCompletedAt ?? currentUser.lastCheckInAt)
  const lastDateNight = dateNightSummary.lastDate

  const overdueTasks = useMemo(
    () => filteredTasks.filter((task) => isOverdue(task) && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [filteredTasks],
  )
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

          <div className="grid grid-cols-2 gap-1 rounded-3xl bg-white p-1 shadow-sm">
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

              {/* rest unchanged */}
            </>
          ) : null}

          {/* history tab unchanged */}
        </div>
      </div>
    </div>
  )
}
