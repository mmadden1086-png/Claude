import { Bell, Heart, MoonStar, SunMedium, Target, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SectionCard } from '../components/SectionCard'
import { PageHeader } from './PageHeader'

export function MenuPage({
  usingMockData,
  focusMode,
  setFocusMode,
  lowEnergyMode,
  setLowEnergyMode,
  notificationStatus,
  onEnableNotifications,
  onStartHere,
  goals,
  goalSuggestion,
  onOpenGoalEditor,
  onClearToday,
  onWrapUpTomorrow,
  onSignOut,
}) {
  const navigate = useNavigate()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <PageHeader title="Menu" body="Settings, notifications, account, and system controls." />

      <SectionCard title="System controls" subtitle="Adjust how Follow Through surfaces work.">
        <div className="grid gap-2">
          <button
            className={`rounded-3xl px-4 py-4 text-left text-sm font-semibold ${focusMode ? 'bg-ink text-white' : 'bg-white text-slate-700'}`}
            type="button"
            onClick={() => setFocusMode((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              <Target size={16} /> {focusMode ? 'Focus Mode on' : 'Focus Mode off'}
            </span>
          </button>
          <button
            className={`rounded-3xl px-4 py-4 text-left text-sm font-semibold ${lowEnergyMode ? 'bg-gold text-white' : 'bg-white text-slate-700'}`}
            type="button"
            onClick={() => setLowEnergyMode((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              <MoonStar size={16} /> {lowEnergyMode ? 'Low Energy on' : 'Low Energy off'}
            </span>
          </button>
          <button className="rounded-3xl bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700" type="button" onClick={onStartHere}>
            <span className="inline-flex items-center gap-2">
              <Zap size={16} /> Go to next task
            </span>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Evening Wrap-Up" subtitle="Close the day without clutter.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700" type="button" onClick={onClearToday}>
          Clear today
        </button>
        <button className="w-full rounded-3xl bg-ink px-4 py-4 text-left text-sm font-semibold text-white" type="button" onClick={onWrapUpTomorrow}>
          Move all Today tasks to tomorrow
        </button>
      </SectionCard>

      <SectionCard title="Notifications" subtitle="Push is wired through Firebase Messaging.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700" type="button" onClick={onEnableNotifications}>
          <span className="inline-flex items-center gap-2">
            <Bell size={16} /> {notificationStatus === 'enabled' ? 'Notifications on' : notificationStatus === 'working' ? 'Checking...' : 'Enable notifications'}
          </span>
        </button>
        <div className="mt-3 space-y-3 text-sm text-slate-600">
          <div className="rounded-3xl bg-canvas p-4">Push: assigned task, due soon, morning digest, evening wrap-up.</div>
          <div className="rounded-3xl bg-canvas p-4">SMS: planned for high-reliability alerts.</div>
          <div className="rounded-3xl bg-canvas p-4">Email: planned for morning and evening summaries.</div>
        </div>
      </SectionCard>

      <SectionCard title="Goals" subtitle="Keep the targets simple and adjustable.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left" type="button" onClick={() => onOpenGoalEditor('weeklyCompletion')}>
          <p className="text-sm font-semibold text-ink">Weekly goal</p>
          <p className="mt-1 text-sm text-slate-600">{goals.weeklyCompletion} tasks per week</p>
        </button>
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left" type="button" onClick={() => onOpenGoalEditor('dailyMinimum')}>
          <p className="text-sm font-semibold text-ink">Daily minimum</p>
          <p className="mt-1 text-sm text-slate-600">{goals.dailyMinimum} task{goals.dailyMinimum === 1 ? '' : 's'} per day</p>
        </button>
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left" type="button" onClick={() => onOpenGoalEditor('reliabilityTarget')}>
          <p className="text-sm font-semibold text-ink">Reliability target</p>
          <p className="mt-1 text-sm text-slate-600">{goals.reliabilityTarget}% on time</p>
        </button>
        {goalSuggestion ? <p className="px-1 text-sm text-slate-500">{goalSuggestion}</p> : null}
      </SectionCard>

      <SectionCard title="Date Night" subtitle="Keep date ideas and date history in one dedicated place.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700" type="button" onClick={() => navigate('/dates')}>
          <span className="inline-flex items-center gap-2">
            <Heart size={16} /> Open Date Night section
          </span>
        </button>
      </SectionCard>

      <SectionCard title="Session" subtitle={usingMockData ? 'Preview mode is active until Firebase keys are added.' : 'Live Firebase data is connected.'}>
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700" type="button" onClick={onSignOut}>
          <span className="inline-flex items-center gap-2">
            <SunMedium size={16} /> Sign out
          </span>
        </button>
      </SectionCard>
        </div>
      </div>
    </div>
  )
}
