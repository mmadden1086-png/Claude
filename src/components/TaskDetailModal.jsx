import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { TimeSelect } from './TimeSelect'
import {
  BOTH_ASSIGNEE_ID,
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  REPEAT_OPTIONS,
  URGENCY_OPTIONS,
  WEEKDAY_OPTIONS,
  getCanonicalUserName,
} from '../lib/constants'
import { normalizeTimeValue, toDate } from '../lib/format'
import { generateRelationalWhy, saveWhyPattern } from '../lib/relationalWhyEngine'
import { generateDoneSuggestion, saveDonePattern } from '../lib/suggestionEngine'
import { buildRepeatPreview } from '../lib/task-utils'
import { getWhyDisplayDecision } from '../lib/why-strength'

function toDateInput(value) {
  const date = toDate(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createFormState(task) {
  return {
    title: task.title ?? '',
    notes: task.notes ?? '',
    assignedTo: task.assignedTo ?? '',
    dueDate: toDateInput(task.dueDate),
    dueTime: normalizeTimeValue(task.dueTime ?? ''),
    urgency: task.urgency ?? 'Today',
    effort: task.effort ?? 'Quick',
    category: task.category ?? 'Home',
    clarity: task.clarity ?? '',
    whyThisMatters: task.whyThisMatters ?? '',
    repeatType: task.repeatType ?? 'none',
    repeatDays: task.repeatDays ?? [],
  }
}

export function TaskDetailModal({ task, users, currentUser, tasks = [], onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => createFormState(task))
  const [whyTouched, setWhyTouched] = useState(Boolean(task.whyThisMatters?.trim()))
  const [whyIsSuggested, setWhyIsSuggested] = useState(false)
  const [doneSuggestion, setDoneSuggestion] = useState('')
  const [whySuggestion, setWhySuggestion] = useState('')
  const [whySeed, setWhySeed] = useState(0)
  const assigneeOptions = [
    ...users.map((user) => ({
      ...user,
      name: getCanonicalUserName(user.email, user.name),
    })),
    { id: BOTH_ASSIGNEE_ID, name: 'Both' },
  ]
  const usersById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
  const repeatHistory = useMemo(
    () =>
      (task.history ?? [])
        .filter((entry) => ['repeat-advanced', 'repeat-skipped', 'repeat-reactivated'].includes(entry.type))
        .slice()
        .reverse()
        .slice(0, 5),
    [task.history],
  )

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!form.title.trim()) {
        setDoneSuggestion('')
        setWhySuggestion('')
        return
      }

      const nextDoneSuggestion = generateDoneSuggestion(form.title)
      const nextWhySuggestion = generateRelationalWhy(
        {
          title: form.title,
          category: form.category,
          assignedTo: form.assignedTo,
          requestedBy: task.requestedBy ?? currentUser?.id,
          createdBy: task.requestedBy ?? currentUser?.id,
        },
        currentUser,
        usersById,
        whySeed,
      )
      const whyDecision = getWhyDisplayDecision(
        {
          ...task,
          ...form,
          requestedBy: task.requestedBy ?? currentUser?.id,
          status: task.status ?? 'not_started',
          snoozeCount: task.snoozeCount ?? 0,
        },
        nextWhySuggestion,
        currentUser?.id,
        tasks,
      )
      const visibleWhySuggestion = whyDecision.text || nextWhySuggestion

      setDoneSuggestion(nextDoneSuggestion)
      setWhySuggestion(visibleWhySuggestion)

      if (!whyTouched && visibleWhySuggestion) {
        setForm((current) => {
          if (current.whyThisMatters.trim() && !whyIsSuggested) return current
          return { ...current, whyThisMatters: visibleWhySuggestion }
        })
        setWhyIsSuggested(true)
      } else if (!whyTouched && !visibleWhySuggestion) {
        setForm((current) => (current.whyThisMatters.trim() ? { ...current, whyThisMatters: '' } : current))
        setWhyIsSuggested(false)
      }
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [
    currentUser,
    form,
    task,
    task.requestedBy,
    tasks,
    usersById,
    whyIsSuggested,
    whySeed,
    whyTouched,
  ])

  function toggleDay(day) {
    setForm((current) => ({
      ...current,
      repeatDays: current.repeatDays.includes(day)
        ? current.repeatDays.filter((item) => item !== day)
        : [...current.repeatDays, day],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const repeatPreview = buildRepeatPreview({
      dueDate: form.dueDate,
      repeatType: form.repeatType,
      repeatDays: form.repeatDays,
    })
    saveDonePattern(form.title, form.clarity)
    saveWhyPattern(form.title, form.whyThisMatters)

    const result = await onSave({
      title: form.title.trim(),
      notes: form.notes.trim(),
      assignedTo: form.assignedTo,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      dueTime: form.dueTime,
      urgency: form.urgency,
      effort: form.effort,
      category: form.category,
      clarity: form.clarity.trim(),
      whyThisMatters: form.whyThisMatters.trim(),
      repeatType: form.repeatType,
      repeatDays: form.repeatType === 'specific-days' ? form.repeatDays : [],
      nextOccurrenceAt: repeatPreview?.toISOString() ?? null,
    })
    if (!result?.blocked) onClose()
  }

  return (
    <section className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto max-h-[calc(100vh-3rem)] max-w-2xl overflow-y-auto rounded-4xl bg-panel p-5 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-accent">Task detail</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Edit task</h2>
          </div>
          <button className="rounded-full bg-white p-3 text-slate-600" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full rounded-3xl border-sand bg-white px-4 py-4 text-base"
            value={form.title}
            onChange={(event) => updateField('title', event.target.value)}
            placeholder="Title"
          />

          <textarea
            className="min-h-24 w-full rounded-3xl border-sand bg-white px-4 py-3"
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder="Notes"
          />

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</span>
              <select
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                value={form.assignedTo}
                onChange={(event) => updateField('assignedTo', event.target.value)}
              >
                {assigneeOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Urgency</span>
              <select
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                value={form.urgency}
                onChange={(event) => updateField('urgency', event.target.value)}
              >
                {URGENCY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</span>
              <input
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                type="date"
                value={form.dueDate}
                onChange={(event) => updateField('dueDate', event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Due time</span>
              <TimeSelect
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                value={form.dueTime}
                onChange={(value) => updateField('dueTime', value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Effort</span>
              <select
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                value={form.effort}
                onChange={(event) => updateField('effort', event.target.value)}
              >
                {EFFORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <select
                className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                value={form.category}
                onChange={(event) => updateField('category', event.target.value)}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <textarea
            className="min-h-20 w-full rounded-3xl border-sand bg-white px-4 py-3"
            value={form.clarity}
            onFocus={() => {
              if (!doneSuggestion && form.title.trim()) {
                setDoneSuggestion(generateDoneSuggestion(form.title))
              }
            }}
            onChange={(event) => updateField('clarity', event.target.value)}
            placeholder={doneSuggestion || 'What does done look like?'}
          />
          {!form.clarity.trim() && doneSuggestion ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent"
                type="button"
                onClick={() => updateField('clarity', doneSuggestion)}
              >
                Apply suggestion: {doneSuggestion}
              </button>
            </div>
          ) : null}

          <textarea
            className="min-h-20 w-full rounded-3xl border-sand bg-white px-4 py-3"
            value={form.whyThisMatters}
            onChange={(event) => {
              setWhyTouched(true)
              setWhyIsSuggested(false)
              updateField('whyThisMatters', event.target.value)
            }}
            placeholder={whySuggestion || 'Why this matters'}
          />
          <div className="flex flex-wrap items-center gap-2">
            {whyIsSuggested && form.whyThisMatters.trim() ? (
              <p className="text-xs text-slate-500">Suggested</p>
            ) : null}
            {!whyTouched && form.title.trim() ? (
              <button
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                type="button"
                onClick={() => setWhySeed((current) => current + 1)}
              >
                Regenerate
              </button>
            ) : null}
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat</span>
            <select
              className="w-full rounded-2xl border-sand bg-white px-4 py-3"
              value={form.repeatType}
              onChange={(event) => updateField('repeatType', event.target.value)}
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {form.repeatType === 'specific-days' ? (
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => (
                <button
                  key={day}
                  className={`rounded-full px-3 py-2 text-sm ${
                    form.repeatDays.includes(day) ? 'bg-accent text-white' : 'bg-white text-slate-600'
                  }`}
                  type="button"
                  onClick={() => toggleDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          ) : null}

          {repeatHistory.length ? (
            <div className="rounded-3xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat history</p>
              <div className="mt-3 space-y-2">
                {repeatHistory.map((entry) => (
                  <div key={`${entry.type}:${entry.at}`} className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600">
                    <p className="font-medium text-ink">
                      {entry.type === 'repeat-advanced' ? 'Advanced to next occurrence' : entry.type === 'repeat-skipped' ? 'Skipped to next occurrence' : 'Reactivated'}
                    </p>
                    <p className="mt-1">{toDate(entry.at)?.toLocaleString() ?? entry.at}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-3">
            <button className="flex-1 rounded-3xl bg-ink px-4 py-4 font-semibold text-white" type="submit">
              Save changes
            </button>
            <button className="rounded-3xl bg-white px-5 py-4 font-medium text-slate-700" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>

          <button className="w-full rounded-3xl bg-danger/10 px-4 py-4 text-sm font-semibold text-danger transition active:scale-[0.99] active:opacity-80" type="button" onClick={onDelete}>
            Delete task
          </button>
        </form>
      </div>
    </section>
  )
}
