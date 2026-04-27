import { Bell, Heart, Mail, MessageCircleHeart, MoonStar, Phone, SunMedium, Target, Zap } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionCard } from '../components/SectionCard'
import { PageHeader } from './PageHeader'

function ToggleRow({ icon: Icon, label, enabled, onToggle }) {
  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]"
      type="button"
      onClick={onToggle}
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon size={16} /> {label}
      </span>
      <span className={`relative h-7 w-12 rounded-full transition ${enabled ? 'bg-accent' : 'bg-slate-200'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${enabled ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

function CompactAction({ icon: Icon, label, onClick, tone = 'default' }) {
  return (
    <button
      className={`w-full rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${tone === 'primary' ? 'bg-accent text-white' : tone === 'soft' ? 'bg-accentSoft text-accent' : 'bg-white text-slate-700'}`}
      type="button"
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-2">
        {Icon ? <Icon size={16} /> : null} {label}
      </span>
    </button>
  )
}

export function MenuPage({
  usingMockData,
  focusMode,
  setFocusMode,
  lowEnergyMode,
  setLowEnergyMode,
  notificationStatus,
  onEnableNotifications,
  onSendTestNotification,
  onTestPartnerNotification,
  currentUser,
  onSaveNotificationPrefs,
  onStartHere,
  goals,
  goalSuggestion,
  onOpenGoalEditor,
  onClearToday,
  onWrapUpTomorrow,
  onThinkingOfYou,
  onSignOut,
}) {
  const navigate = useNavigate()
  const isNotificationError = ['blocked', 'unsupported', 'service-worker', 'config-error', 'install-required'].includes(notificationStatus)
  const notificationLabel = {
    enabled: 'Notifications are on',
    working: 'Setting up…',
    blocked: 'Notifications blocked',
    unsupported: 'Not supported on this device',
    'service-worker': 'Setup issue — try reloading',
    'config-error': 'Not configured',
    'install-required': 'Install app first',
  }[notificationStatus] ?? 'Enable notifications'
  const notificationNote = {
    blocked: 'Permission was denied. Open browser settings and allow notifications for this site.',
    unsupported: 'Your browser or device does not support push notifications.',
    'service-worker': 'The notification service failed to start. Reload the app and try again.',
    'config-error': 'Push notifications are not fully set up yet.',
    'install-required': 'Add this app to your home screen, then come back to enable notifications.',
  }[notificationStatus]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4 pb-24">
          <PageHeader title="Menu" body="Settings, notifications, account, and system controls." />

          <SectionCard title="System controls" subtitle="Modes change how work is surfaced. Actions move you forward.">
            <div className="space-y-2">
              <ToggleRow
                icon={Target}
                label="Focus mode"
                enabled={focusMode}
                onToggle={() => setFocusMode((current) => !current)}
              />
              <ToggleRow
                icon={MoonStar}
                label="Low energy"
                enabled={lowEnergyMode}
                onToggle={() => setLowEnergyMode((current) => !current)}
              />
              <CompactAction icon={Zap} label="Go to next task" onClick={onStartHere} />
            </div>
          </SectionCard>

          <SectionCard title="Notifications" subtitle="Use alerts to surface what needs attention, not to create noise.">
            <div className="space-y-2">
              <CompactAction
                icon={Bell}
                label={notificationLabel}
                onClick={onEnableNotifications}
                tone={isNotificationError ? 'default' : notificationStatus === 'enabled' ? 'soft' : 'primary'}
              />
              {notificationNote ? <p className="px-1 text-xs text-rose-600">{notificationNote}</p> : null}
              {notificationStatus === 'enabled' ? (
                <details className="rounded-3xl bg-canvas px-4 py-3 text-sm text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-700">Test notification tools</summary>
                  <div className="mt-3 space-y-2">
                    <button className="w-full rounded-2xl bg-white px-3 py-3 text-left text-sm font-medium text-slate-600" type="button" onClick={onSendTestNotification}>
                      Send test notification to myself
                    </button>
                    <button className="w-full rounded-2xl bg-white px-3 py-3 text-left text-sm font-medium text-slate-600" type="button" onClick={onTestPartnerNotification}>
                      Test partner notification
                    </button>
                  </div>
                </details>
              ) : null}
              <div className="rounded-3xl bg-canvas p-4 text-sm text-slate-600">
                Push alerts cover assigned tasks, due-soon reminders, check-ins, and wrap-up prompts. SMS and email are planned for later.
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Evening wrap-up" subtitle="Use this when today is done and you want a clean reset.">
            <div className="space-y-2">
              <CompactAction label="Push today’s tasks to tomorrow" onClick={onClearToday} />
              <CompactAction label="Move everything and close out" onClick={onWrapUpTomorrow} tone="primary" />
            </div>
          </SectionCard>

          <SectionCard title="Goals" subtitle="Keep the targets simple and adjustable.">
            <div className="space-y-2">
              <button className="w-full rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenGoalEditor('weeklyCompletion')}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Weekly goal</p>
                  <p className="text-sm text-slate-600">{goals.weeklyCompletion}/week</p>
                </div>
              </button>
              <button className="w-full rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenGoalEditor('dailyMinimum')}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Daily minimum</p>
                  <p className="text-sm text-slate-600">{goals.dailyMinimum}/day</p>
                </div>
              </button>
              <button className="w-full rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenGoalEditor('reliabilityTarget')}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">Reliability target</p>
                  <p className="text-sm text-slate-600">{goals.reliabilityTarget}%</p>
                </div>
              </button>
              {goalSuggestion ? <p className="px-1 text-sm text-slate-500">{goalSuggestion}</p> : null}
            </div>
          </SectionCard>

          <SectionCard title="Relationship shortcuts" subtitle="Small actions that support connection.">
            <div className="space-y-2">
              <CompactAction icon={MessageCircleHeart} label="Send thinking of you" onClick={onThinkingOfYou} />
              <CompactAction icon={Heart} label="Open date nights" onClick={() => navigate('/dates')} />
            </div>
          </SectionCard>

          <div className="px-2 pb-6 text-center text-sm text-slate-500">
            <p>{usingMockData ? 'Preview mode is active until Firebase keys are added.' : 'Live Firebase data is connected.'}</p>
            <button className="mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-3 font-medium text-slate-600 transition duration-150 active:opacity-60" type="button" onClick={onSignOut}>
              <SunMedium size={16} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
