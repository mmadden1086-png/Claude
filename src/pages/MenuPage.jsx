import { Bell, Heart, Mail, MessageCircleHeart, MoonStar, Phone, SunMedium, Target, Zap } from 'lucide-react'
import { useState } from 'react'
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
  const [phone, setPhone] = useState(currentUser?.phoneNumber ?? '')
  const [notifEmail, setNotifEmail] = useState(currentUser?.notificationEmail ?? currentUser?.email ?? '')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)

  async function handleSavePhone() {
    setPhoneSaving(true)
    await onSaveNotificationPrefs({ phoneNumber: phone })
    setPhoneSaving(false)
  }

  async function handleToggleSMS() {
    const next = !currentUser?.smsEnabled
    if (next && !currentUser?.phoneNumber && !phone.trim()) return
    await onSaveNotificationPrefs({ smsEnabled: next })
  }

  async function handleSaveEmail() {
    setEmailSaving(true)
    await onSaveNotificationPrefs({ notificationEmail: notifEmail })
    setEmailSaving(false)
  }

  async function handleToggleEmail() {
    await onSaveNotificationPrefs({ emailEnabled: !currentUser?.emailEnabled })
  }

  const smsEnabled = currentUser?.smsEnabled ?? false
  const emailEnabled = currentUser?.emailEnabled ?? false
  const hasPhone = Boolean(currentUser?.phoneNumber)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <PageHeader title="Menu" body="Settings, notifications, account, and system controls." />

      <SectionCard title="System controls" subtitle="Adjust how Follow Through surfaces work.">
        <div className="grid gap-2">
          <button
            className={`rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${focusMode ? 'bg-ink text-white' : 'bg-white text-slate-700'}`}
            type="button"
            onClick={() => setFocusMode((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              <Target size={16} /> {focusMode ? 'Focus Mode on' : 'Focus Mode off'}
            </span>
          </button>
          <button
            className={`rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${lowEnergyMode ? 'bg-gold text-white' : 'bg-white text-slate-700'}`}
            type="button"
            onClick={() => setLowEnergyMode((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              <MoonStar size={16} /> {lowEnergyMode ? 'Low Energy on' : 'Low Energy off'}
            </span>
          </button>
          <button className="rounded-3xl bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={onStartHere}>
            <span className="inline-flex items-center gap-2">
              <Zap size={16} /> Go to next task
            </span>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Evening Wrap-Up" subtitle="Close the day without clutter.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={onClearToday}>
          Push today's tasks to tomorrow
        </button>
        <button className="w-full rounded-3xl bg-ink px-4 py-4 text-left text-sm font-semibold text-white transition duration-150 active:scale-[0.98]" type="button" onClick={onWrapUpTomorrow}>
          Wrap up — move everything and close out
        </button>
      </SectionCard>

      <SectionCard title="Push notifications" subtitle="Real-time alerts for tasks, partner activity, and reminders.">
        {(() => {
          const isError = ['blocked', 'unsupported', 'service-worker', 'config-error', 'error'].includes(notificationStatus)
          const label = {
            enabled: 'Push on — tap to re-test',
            working: 'Setting up…',
            blocked: 'Notifications blocked',
            unsupported: 'Not supported on this device',
            'service-worker': 'Setup issue — try reloading',
            'config-error': 'Not configured',
            'install-required': 'Install app first',
            error: 'Setup failed — tap to retry',
          }[notificationStatus] ?? 'Enable push notifications'
          const errorNote = {
            blocked: 'Permission was denied. Open your browser settings and allow notifications for this site.',
            unsupported: 'Your browser or device doesn\'t support push notifications.',
            'service-worker': 'The notification service failed to start. Reload the app and try again.',
            'config-error': 'Push notifications aren\'t fully set up yet.',
            'install-required': 'Add Follow Through to your home screen, then come back to enable notifications.',
            error: 'Something went wrong setting up notifications. Tap again to retry.',
          }[notificationStatus]

          return (
            <>
              <button
                className={`w-full rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${isError ? 'bg-rose-50 text-rose-700' : notificationStatus === 'enabled' ? 'bg-accentSoft text-accent' : 'bg-white text-slate-700'}`}
                type="button"
                disabled={notificationStatus === 'working'}
                onClick={onEnableNotifications}
              >
                <span className="inline-flex items-center gap-2">
                  <Bell size={16} /> {label}
                </span>
              </button>
              {errorNote ? (
                <p className="px-1 text-xs text-rose-600">{errorNote}</p>
              ) : null}
              {notificationStatus === 'enabled' ? (
                <>
                  <button
                    className="w-full rounded-3xl bg-white px-4 py-3 text-left text-sm font-medium text-slate-600 transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={onSendTestNotification}
                  >
                    Send test to myself
                  </button>
                  <button
                    className="w-full rounded-3xl bg-white px-4 py-3 text-left text-sm font-medium text-slate-600 transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={onTestPartnerNotification}
                  >
                    Test partner notification
                  </button>
                </>
              ) : null}
            </>
          )
        })()}
      </SectionCard>

      <SectionCard title="SMS alerts" subtitle="High-priority alerts sent as text messages via Twilio.">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98] disabled:opacity-50"
              type="button"
              disabled={phoneSaving || !phone.trim()}
              onClick={handleSavePhone}
            >
              {phoneSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <button
            className={`w-full rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${smsEnabled ? 'bg-accentSoft text-accent' : 'bg-white text-slate-700'} ${!hasPhone ? 'opacity-50' : ''}`}
            type="button"
            disabled={!hasPhone}
            onClick={handleToggleSMS}
          >
            <span className="inline-flex items-center gap-2">
              <Phone size={16} /> {smsEnabled ? 'SMS alerts on' : 'SMS alerts off'}
            </span>
          </button>
          {!hasPhone ? (
            <p className="px-1 text-xs text-slate-400">Add a phone number above to enable SMS alerts.</p>
          ) : (
            <p className="px-1 text-xs text-slate-400">Mood drops, appreciation, dialogue answers, and due-soon reminders. Requires Twilio credentials in Firebase.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Email digests" subtitle="Daily summaries and reminders sent to your inbox via SendGrid.">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              type="email"
              placeholder="your@email.com"
              value={notifEmail}
              onChange={(e) => setNotifEmail(e.target.value)}
            />
            <button
              className="shrink-0 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98] disabled:opacity-50"
              type="button"
              disabled={emailSaving || !notifEmail.trim()}
              onClick={handleSaveEmail}
            >
              {emailSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <button
            className={`w-full rounded-3xl px-4 py-4 text-left text-sm font-semibold transition duration-150 active:scale-[0.98] ${emailEnabled ? 'bg-accentSoft text-accent' : 'bg-white text-slate-700'}`}
            type="button"
            onClick={handleToggleEmail}
          >
            <span className="inline-flex items-center gap-2">
              <Mail size={16} /> {emailEnabled ? 'Email digests on' : 'Email digests off'}
            </span>
          </button>
          <p className="px-1 text-xs text-slate-400">Morning and evening task summaries, weekly check-in reminders. Requires SendGrid credentials in Firebase.</p>
        </div>
      </SectionCard>

      <SectionCard title="Goals" subtitle="Keep the targets simple and adjustable.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenGoalEditor('weeklyCompletion')}>
          <p className="text-sm font-semibold text-ink">Weekly goal</p>
          <p className="mt-1 text-sm text-slate-600">{goals.weeklyCompletion} tasks per week</p>
        </button>
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenGoalEditor('dailyMinimum')}>
          <p className="text-sm font-semibold text-ink">Daily minimum</p>
          <p className="mt-1 text-sm text-slate-600">{goals.dailyMinimum} task{goals.dailyMinimum === 1 ? '' : 's'} per day</p>
        </button>
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left transition duration-150 active:scale-[0.98]" type="button" onClick={() => onOpenGoalEditor('reliabilityTarget')}>
          <p className="text-sm font-semibold text-ink">Reliability target</p>
          <p className="mt-1 text-sm text-slate-600">{goals.reliabilityTarget}% on time</p>
        </button>
        {goalSuggestion ? <p className="px-1 text-sm text-slate-500">{goalSuggestion}</p> : null}
      </SectionCard>

      <SectionCard title="Connection" subtitle="Small gestures keep the relationship warm.">
        <button
          className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
          type="button"
          onClick={onThinkingOfYou}
        >
          <span className="inline-flex items-center gap-2">
            <MessageCircleHeart size={16} /> Send "thinking of you"
          </span>
        </button>
        <p className="px-1 text-xs text-slate-500">Sends a warm push notification to your partner. One tap, no typing required.</p>
      </SectionCard>

      <SectionCard title="Date Night" subtitle="Keep date ideas and date history in one dedicated place.">
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={() => navigate('/dates')}>
          <span className="inline-flex items-center gap-2">
            <Heart size={16} /> Open Date Night section
          </span>
        </button>
      </SectionCard>

      <SectionCard title="Session" subtitle={usingMockData ? 'Preview mode is active until Firebase keys are added.' : 'Live Firebase data is connected.'}>
        <button className="w-full rounded-3xl bg-white px-4 py-4 text-left text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]" type="button" onClick={onSignOut}>
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
