import { useEffect, useMemo, useRef, useState } from 'react'
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
import { generateRelationalWhy, saveWhyPattern } from '../lib/relationalWhyEngine'
import { fetchAiTaskSuggestion } from '../lib/aiTaskSuggestions'
import { generateDoneSuggestion, saveDonePattern } from '../lib/suggestionEngine'
import { inferCategory, inferEffort, inferRepeatType } from '../lib/task-utils'
import { getWhyDisplayDecision } from '../lib/why-strength'

const initialState = {
  title: '',
  notes: '',
  assignedTo: '',
  dueDate: '',
  dueTime: '',
  urgency: 'Today',
  effort: 'Quick',
  category: 'Home',
  clarity: '',
  whyThisMatters: '',
  repeatType: 'none',
  repeatDays: [],
}

function mostCommon(values = [], fallback) {
  const buckets = values.filter(Boolean).reduce((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1
    return accumulator
  }, {})
  const winner = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0]
  return winner ?? fallback
}

function buildInitialState(currentUserId, defaults = {}) {
  return {
    ...initialState,
    assignedTo: currentUserId,
    ...defaults,
    title: '',
    notes: '',
    clarity: '',
    whyThisMatters: '',
    dueDate: '',
    dueTime: '',
    repeatDays: defaults.repeatType === 'specific-days' ? defaults.repeatDays ?? [] : [],
  }
}

export function QuickAddCard({ currentUser, users, tasks = [], onSubmit, expanded: expandedProp, onExpandedChange }) {
  const preferredDefaults = useMemo(() => {
    const recentCreated = tasks
      .filter((task) => task.requestedBy === currentUser.id)
      .slice(0, 8)

    return {
      assignedTo: mostCommon(recentCreated.map((task) => task.assignedTo), currentUser.id),
      urgency: mostCommon(recentCreated.map((task) => task.urgency), initialState.urgency),
      effort: mostCommon(recentCreated.map((task) => task.effort), initialState.effort),
      category: mostCommon(recentCreated.map((task) => task.category), initialState.category),
      repeatType: mostCommon(recentCreated.map((task) => task.repeatType).filter((value) => value && value !== 'none'), initialState.repeatType),
      repeatDays: recentCreated.find((task) => task.repeatType === 'specific-days' && task.repeatDays?.length)?.repeatDays ?? [],
    }
  }, [currentUser.id, tasks])
  const [form, setForm] = useState(() => buildInitialState(currentUser.id, preferredDefaults))
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false)
  const [doneIsSuggested, setDoneIsSuggested] = useState(false)
  const [whyTouched, setWhyTouched] = useState(false)
  const [whyIsSuggested, setWhyIsSuggested] = useState(false)
  const [doneSuggestion, setDoneSuggestion] = useState('')
  const [whySuggestion, setWhySuggestion] = useState('')
  const [whySeed, setWhySeed] = useState(0)
  const suggestedDoneRef = useRef('')
  const suggestedWhyRef = useRef('')
  const assigneeOptions = [
    ...users.map((user) => ({
      ...user,
      name: getCanonicalUserName(user.email, user.name),
    })),
    { id: BOTH_ASSIGNEE_ID, name: 'Both' },
  ]
  const usersById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users])
  const expanded = expandedProp ?? internalExpanded

  function setExpanded(nextValue) {
    setInternalExpanded(nextValue)
    onExpandedChange?.(nextValue)
  }

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'title') {
        next.repeatType = inferRepeatType(value, current.repeatType)
        next.category = inferCategory(value, current.category)
        next.effort = inferEffort(value, current.effort)
      }
      return next
    })
  }

  useEffect(() => {
    const abortController = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      const title = form.title.trim()

      if (title.length < 3) {
        setDoneSuggestion('')
        setWhySuggestion('')
        setIsSuggestionLoading(false)
        if (doneIsSuggested) {
          setForm((current) => (current.clarity.trim() ? { ...current, clarity: '' } : current))
          setDoneIsSuggested(false)
          suggestedDoneRef.current = ''
        }
        if (!whyTouched) {
          setForm((current) => (current.whyThisMatters.trim() && !whyIsSuggested ? current : { ...current, whyThisMatters: '' }))
          setWhyIsSuggested(false)
          suggestedWhyRef.current = ''
        }
        return
      }

      const suggestionTask = {
        title: form.title,
        category: form.category,
        assignedTo: form.assignedTo,
        requestedBy: currentUser.id,
        createdBy: currentUser.id,
      }
      const nextDoneSuggestion = generateDoneSuggestion(suggestionTask)
      const nextWhySuggestion = generateRelationalWhy(
        suggestionTask,
        { currentUser },
        usersById,
        whySeed,
      )

      function applySuggestions(nextDoneSuggestion, nextWhySuggestion) {
        const whyDecision = getWhyDisplayDecision(
          {
            ...form,
            requestedBy: currentUser.id,
            status: 'not_started',
            snoozeCount: 0,
          },
          nextWhySuggestion,
          currentUser.id,
          tasks,
        )
        const visibleWhySuggestion = whyDecision.text || nextWhySuggestion

        setDoneSuggestion(nextDoneSuggestion)
        setWhySuggestion(visibleWhySuggestion)

        if (nextDoneSuggestion) {
          setForm((current) => {
            if (current.clarity.trim() && current.clarity !== suggestedDoneRef.current) return current
            if (current.clarity === nextDoneSuggestion) return current
            return { ...current, clarity: nextDoneSuggestion }
          })
          suggestedDoneRef.current = nextDoneSuggestion
          setDoneIsSuggested(true)
        }

        if (!whyTouched && visibleWhySuggestion) {
          setForm((current) => {
            if (current.whyThisMatters.trim() && current.whyThisMatters !== suggestedWhyRef.current) return current
            if (current.whyThisMatters === visibleWhySuggestion) return current
            return { ...current, whyThisMatters: visibleWhySuggestion }
          })
          suggestedWhyRef.current = visibleWhySuggestion
          setWhyIsSuggested(true)
        } else if (!whyTouched && !visibleWhySuggestion) {
          setForm((current) => (current.whyThisMatters.trim() ? { ...current, whyThisMatters: '' } : current))
          setWhyIsSuggested(false)
          suggestedWhyRef.current = ''
        }
      }

      applySuggestions(nextDoneSuggestion, nextWhySuggestion)

      setIsSuggestionLoading(true)

      try {
        const aiSuggestion = await fetchAiTaskSuggestion(
          {
            title,
            assignedTo: form.assignedTo,
            requestedBy: currentUser.id,
          },
          abortController.signal,
        )

        if (!aiSuggestion) return
        applySuggestions(aiSuggestion.doneWhen || nextDoneSuggestion, aiSuggestion.why || nextWhySuggestion)
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn('AI task suggestion failed; keeping local suggestion.', error)
        }
      } finally {
        if (!abortController.signal.aborted) setIsSuggestionLoading(false)
      }
    }, 600)

    return () => {
      abortController.abort()
      window.clearTimeout(timeoutId)
    }
  }, [currentUser, doneIsSuggested, form, tasks, usersById, whyIsSuggested, whySeed, whyTouched])

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
    if (!form.title.trim() || isSubmitting) return

    setIsSubmitting(true)
    saveDonePattern(form.title, form.clarity)
    saveWhyPattern(form.title, form.whyThisMatters)

    try {
      const result = await onSubmit(form)
      if (result?.blocked) return
      setForm(buildInitialState(currentUser.id, preferredDefaults))
      setExpanded(false)
      setWhyTouched(false)
      setWhyIsSuggested(false)
      setDoneIsSuggested(false)
      setIsSuggestionLoading(false)
      suggestedDoneRef.current = ''
      suggestedWhyRef.current = ''
      setWhySeed(0)
      setDoneSuggestion('')
      setWhySuggestion('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-4xl border border-white/70 bg-panel/95 p-4 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Quick Add</h2>
          <p className="mt-1 text-sm text-slate-600">Capture the ask in under a few seconds, then expand only if needed.</p>
        </div>
        <button
          className="rounded-full bg-accentSoft px-4 py-2 text-sm font-medium text-accent"
          type="button"
          disabled={isSubmitting}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Simple' : 'Expand'}
        </button>
      </div>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <input
          className="w-full rounded-3xl border-sand bg-white px-4 py-4 text-base"
          disabled={isSubmitting}
          placeholder="What needs follow-through?"
          value={form.title}
          onChange={(event) => updateField('title', event.target.value)}
        />

        {form.title ? (
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-accentSoft px-3 py-1 font-semibold text-accent">Suggested category: {form.category}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">Suggested effort: {form.effort}</span>
            {form.repeatType !== 'none' ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">Suggested repeat: {form.repeatType}</span>
            ) : null}
              {isSuggestionLoading ? (
                <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-500">Generating suggestions...</span>
              ) : null}
            </div>
            {!expanded && doneSuggestion ? (
              <button
                className="rounded-3xl bg-slate-50 px-4 py-3 text-left text-slate-700"
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setExpanded(true)
                  setDoneIsSuggested(true)
                  suggestedDoneRef.current = doneSuggestion
                  updateField('clarity', doneSuggestion)
                }}
              >
                <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Done when</span>
                {doneSuggestion}
              </button>
            ) : null}
            {!expanded && whySuggestion ? (
              <button
                className="rounded-3xl bg-slate-50 px-4 py-3 text-left text-slate-700"
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setExpanded(true)
                  if (!form.whyThisMatters.trim()) updateField('whyThisMatters', whySuggestion)
                }}
              >
                <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Why this matters</span>
                <span className="whitespace-pre-line">{whySuggestion}</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {expanded ? (
          <>
            <textarea
              className="min-h-24 w-full rounded-3xl border-sand bg-white px-4 py-3"
              placeholder="Notes"
              disabled={isSubmitting}
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</span>
                <select
                  className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  value={form.dueDate}
                  onChange={(event) => updateField('dueDate', event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Due time</span>
                <TimeSelect
                  className="w-full rounded-2xl border-sand bg-white px-4 py-3"
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
              disabled={isSubmitting}
              placeholder={doneSuggestion || 'What does done look like?'}
              value={form.clarity}
              onFocus={() => {
                if (!doneSuggestion && form.title.trim()) {
                  setDoneSuggestion(generateDoneSuggestion(form))
                }
              }}
              onChange={(event) => {
                setDoneIsSuggested(false)
                suggestedDoneRef.current = ''
                updateField('clarity', event.target.value)
              }}
            />
            {!form.clarity.trim() && doneSuggestion ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setDoneIsSuggested(true)
                    suggestedDoneRef.current = doneSuggestion
                    updateField('clarity', doneSuggestion)
                  }}
                >
                  Apply suggestion: {doneSuggestion}
                </button>
              </div>
            ) : null}

            <textarea
              className="min-h-20 w-full rounded-3xl border-sand bg-white px-4 py-3"
              disabled={isSubmitting}
              placeholder={whySuggestion || 'Why this matters'}
              value={form.whyThisMatters}
              onChange={(event) => {
                setWhyTouched(true)
                setWhyIsSuggested(false)
                suggestedWhyRef.current = ''
                updateField('whyThisMatters', event.target.value)
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {whyIsSuggested && form.whyThisMatters.trim() ? (
                <p className="text-xs text-slate-500">Suggested</p>
              ) : null}
              {!whyTouched && form.title.trim() ? (
                <button
                  className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
                  type="button"
                  disabled={isSubmitting}
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
              disabled={isSubmitting}
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
                    disabled={isSubmitting}
                    onClick={() => toggleDay(day)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <button
          className="w-full rounded-3xl bg-ink px-4 py-4 text-base font-semibold text-white disabled:opacity-70"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving task...' : 'Save task'}
        </button>
      </form>
    </section>
  )
}
