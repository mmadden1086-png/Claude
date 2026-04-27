import { Shield, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from './ConfirmModal'
import { TimeSelect } from './TimeSelect'
import {
  BOTH_ASSIGNEE_ID,
  CATEGORY_OPTIONS,
  EFFORT_OPTIONS,
  REPEAT_OPTIONS,
  TASK_STATUS,
  URGENCY_OPTIONS,
  WEEKDAY_OPTIONS,
  getCanonicalUserName,
} from '../lib/constants'
import { describeRepeat, formatDueContext, formatStatusLabel, formatTaskAge, getTaskStatus, normalizeTimeValue, toDate } from '../lib/format'
import { generateRelationalWhy, saveWhyPattern } from '../lib/relationalWhyEngine'
import { fetchAiTaskSuggestion } from '../lib/aiTaskSuggestions'
import { generateDoneSuggestion, saveDonePattern } from '../lib/suggestionEngine'
import { buildRepeatPreview } from '../lib/task-utils'
import { getWhyDisplayDecision } from '../lib/why-strength'
import { fetchTaskBreakdown } from '../lib/aiTaskBreakdown'

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
    protected: task.protected ?? false,
  }
}

function formatCommentTime(createdAt) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

export function TaskDetailModal({ task, users, currentUser, tasks = [], onClose, onSave, onDelete, onAction, onQuickAdd, onAddComment }) {
  const [form, setForm] = useState(() => createFormState(task))
  const [isEditing, setIsEditing] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false)
  const [doneIsSuggested, setDoneIsSuggested] = useState(false)
  const [whyTouched, setWhyTouched] = useState(Boolean(task.whyThisMatters?.trim()))
  const [whyIsSuggested, setWhyIsSuggested] = useState(false)
  const [doneSuggestion, setDoneSuggestion] = useState('')
  const [whySuggestion, setWhySuggestion] = useState('')
  const [whySeed, setWhySeed] = useState(0)
  const suggestedDoneRef = useRef('')
  const suggestedWhyRef = useRef('')
  const [breakdownSteps, setBreakdownSteps] = useState([])
  const [breakdownBusy, setBreakdownBusy] = useState(false)
  const [addedStepTitles, setAddedStepTitles] = useState([])
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
        return
      }

      const suggestionTask = {
        ...task,
        ...form,
        requestedBy: task.requestedBy ?? currentUser?.id,
        createdBy: task.requestedBy ?? currentUser?.id,
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
            requestedBy: task.requestedBy ?? currentUser?.id ?? null,
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
  }, [
    currentUser,
    doneIsSuggested,
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
      dueDate: form.dueDate ? new Date(form.dueDate + 'T12:00:00').toISOString() : null,
      dueTime: form.dueTime,
      urgency: form.urgency,
      effort: form.effort,
      category: form.category,
      clarity: form.clarity.trim(),
      whyThisMatters: form.whyThisMatters.trim(),
      repeatType: form.repeatType,
      repeatDays: form.repeatType === 'specific-days' ? form.repeatDays : [],
      nextOccurrenceAt: repeatPreview?.toISOString() ?? null,
      protected: form.protected,
    })
    if (!result?.blocked) onClose()
  }

  async function handleDelete(scope = 'single') {
    if (deleteBusy) return
    setDeleteBusy(true)
    try {
      await onDelete?.({ scope })
      setDeleteConfirmOpen(false)
      onClose?.()
    } finally {
      setDeleteBusy(false)
    }
  }

  const requestedByName = usersById[task.requestedBy]?.name
    ? getCanonicalUserName(usersById[task.requestedBy]?.email, usersById[task.requestedBy]?.name)
    : task.requestedBy === currentUser?.id
      ? currentUser?.name
      : 'Partner'
  const assignedToName = task.assignedTo === BOTH_ASSIGNEE_ID
    ? 'Both'
    : assigneeOptions.find((user) => user.id === task.assignedTo)?.name ?? 'Unassigned'
  const repeatText = describeRepeat(task)
  const taskAge = formatTaskAge(task)
  const taskStatus = getTaskStatus(task)

  async function handleAddCommentSubmit() {
    const text = commentText.trim()
    if (!text || commentBusy) return
    setCommentBusy(true)
    try {
      await onAddComment?.(text)
      setCommentText('')
    } finally {
      setCommentBusy(false)
    }
  }

  function handleReadAction(action) {
    onAction?.(action, task)
    onClose?.()
  }

  async function handleBreakdown() {
    setBreakdownBusy(true)
    try {
      const steps = await fetchTaskBreakdown({ title: task.title, notes: task.notes ?? '', clarity: task.clarity ?? '' })
      setBreakdownSteps(steps)
      setAddedStepTitles([])
    } catch (error) {
      console.warn('Task breakdown failed.', error)
    } finally {
      setBreakdownBusy(false)
    }
  }

  async function handleAddStep(step) {
    const result = await onQuickAdd?.({
      title: step.title,
      notes: `Part of: ${task.title}`,
      assignedTo: task.assignedTo ?? currentUser.id,
      dueDate: '',
      dueTime: '',
      urgency: task.urgency ?? 'This week',
      effort: step.effort,
      category: task.category ?? 'Home',
      clarity: step.doneWhen || '',
      whyThisMatters: task.whyThisMatters ?? '',
      repeatType: 'none',
      repeatDays: [],
    })
    if (!result?.blocked) setAddedStepTitles((current) => [...current, step.title])
  }

  async function handleAddAllSteps() {
    for (const step of breakdownSteps) {
      if (!addedStepTitles.includes(step.title)) {
        await handleAddStep(step)
      }
    }
  }

  if (!isEditing) {
    return (
      <section className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-4xl bg-panel p-5 shadow-card"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-accent">Task detail</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{task.title}</h2>
            </div>
            <button className="rounded-full bg-white p-3 text-slate-600" type="button" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                <p className="mt-2 text-sm text-ink">{formatStatusLabel(task)}</p>
              </div>
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due</p>
                <p className="mt-2 text-sm text-ink">{formatDueContext(task)}</p>
              </div>
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
                <p className="mt-2 text-sm text-ink">{assignedToName}</p>
              </div>
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requested by</p>
                <p className="mt-2 text-sm text-ink">{requestedByName}</p>
              </div>
            </div>

            {task.notes ? (
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                <p className="mt-2 text-sm text-slate-700">{task.notes}</p>
              </div>
            ) : null}

            {task.clarity ? (
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Done when</p>
                <p className="mt-2 text-sm text-slate-700">{task.clarity}</p>
              </div>
            ) : null}

            {task.whyThisMatters ? (
              <div className="rounded-3xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this matters</p>
                <p className="mt-2 text-sm text-slate-700">{task.whyThisMatters}</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {task.category ? (
                <div className="rounded-3xl bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
                  <p className="mt-2 text-sm text-ink">{task.category}</p>
                </div>
              ) : null}
              {task.effort ? (
                <div className="rounded-3xl bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Effort</p>
                  <p className="mt-2 text-sm text-ink">{task.effort}</p>
                </div>
              ) : null}
              {task.urgency ? (
                <div className="rounded-3xl bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Urgency</p>
                  <p className="mt-2 text-sm text-ink">{task.urgency}</p>
                </div>
              ) : null}
              {repeatText ? (
                <div className="rounded-3xl bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Repeat</p>
                  <p className="mt-2 text-sm text-ink">{repeatText}</p>
                </div>
              ) : null}
              {taskAge ? (
                <div className="rounded-3xl bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Added</p>
                  <p className="mt-2 text-sm text-ink">{taskAge}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thread</p>
              {(task.comments ?? []).length ? (
                <div className="mt-3 space-y-3">
                  {(task.comments ?? []).map((comment) => (
                    <div key={comment.id} className="rounded-2xl bg-canvas px-3 py-2">
                      <p className="text-xs font-medium text-slate-500">{comment.authorName ?? 'You'} · {formatCommentTime(comment.createdAt)}</p>
                      <p className="mt-1 text-sm text-ink">{comment.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-2xl border border-slate-200 bg-canvas px-3 py-2 text-sm placeholder:text-slate-400"
                  placeholder="Add a note…"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleAddCommentSubmit() } }}
                />
                <button
                  className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98] disabled:opacity-40"
                  type="button"
                  disabled={!commentText.trim() || commentBusy}
                  onClick={handleAddCommentSubmit}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {taskStatus === TASK_STATUS.COMPLETED ? (
                <button
                  className="min-w-[10rem] flex-1 rounded-3xl bg-accent px-4 py-4 font-semibold text-white transition duration-150 active:scale-[0.98]"
                  type="button"
                  onClick={() => handleReadAction('reopen')}
                >
                  Reopen
                </button>
              ) : taskStatus === TASK_STATUS.IN_PROGRESS ? (
                <>
                  <button
                    className="min-w-[10rem] flex-1 rounded-3xl bg-accent px-4 py-4 font-semibold text-white transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={() => handleReadAction('done')}
                  >
                    Done
                  </button>
                  <button
                    className="min-w-[8rem] flex-1 rounded-3xl bg-white px-5 py-4 font-medium text-slate-700 transition duration-150 active:scale-[0.98] sm:flex-none"
                    type="button"
                    onClick={() => handleReadAction('snooze')}
                  >
                    Snooze
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="min-w-[10rem] flex-1 rounded-3xl bg-accent px-4 py-4 font-semibold text-white transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={() => handleReadAction('start')}
                  >
                    Start
                  </button>
                  <button
                    className="min-w-[8rem] flex-1 rounded-3xl bg-white px-5 py-4 font-medium text-slate-700 transition duration-150 active:scale-[0.98] sm:flex-none"
                    type="button"
                    onClick={() => handleReadAction('done')}
                  >
                    Done
                  </button>
                  <button
                    className="min-w-[8rem] flex-1 rounded-3xl bg-white px-5 py-4 font-medium text-slate-700 transition duration-150 active:scale-[0.98] sm:flex-none"
                    type="button"
                    onClick={() => handleReadAction('snooze')}
                  >
                    Snooze
                  </button>
                </>
              )}
              <button className="min-w-[10rem] flex-1 rounded-3xl bg-ink px-4 py-4 font-semibold text-white" type="button" onClick={() => setIsEditing(true)}>
                Edit task
              </button>
              <button className="min-w-[8rem] flex-1 rounded-3xl bg-white px-5 py-4 font-medium text-slate-700 sm:flex-none" type="button" onClick={onClose}>
                Close
              </button>
            </div>

            {task.effort === 'Heavy' ? (
              <div className="rounded-3xl bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Break this down</p>
                  {breakdownSteps.length > 0 && !addedStepTitles.length ? (
                    <button
                      className="rounded-2xl bg-accent px-3 py-1.5 text-xs font-semibold text-white transition duration-150 active:scale-[0.98] active:opacity-80"
                      type="button"
                      onClick={handleAddAllSteps}
                    >
                      Add all steps
                    </button>
                  ) : null}
                </div>
                {breakdownSteps.length ? (
                  <div className="mt-3 space-y-2">
                    {breakdownSteps.map((step) => {
                      const added = addedStepTitles.includes(step.title)
                      return (
                        <div key={step.title} className="flex items-start gap-3 rounded-2xl bg-canvas px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">{step.title}</p>
                            {step.doneWhen ? <p className="mt-0.5 text-xs text-slate-500">{step.doneWhen}</p> : null}
                          </div>
                          <button
                            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition duration-150 active:scale-[0.97] ${added ? 'bg-white text-slate-400' : 'bg-accent text-white'}`}
                            type="button"
                            disabled={added}
                            onClick={() => handleAddStep(step)}
                          >
                            {added ? 'Added' : 'Add'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <button
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-canvas px-4 py-3 text-sm font-medium text-slate-600 transition duration-150 active:scale-[0.98] active:opacity-75"
                    type="button"
                    disabled={breakdownBusy}
                    onClick={handleBreakdown}
                  >
                    <Sparkles size={14} />
                    {breakdownBusy ? 'Thinking…' : 'Break into steps with AI'}
                  </button>
                )}
              </div>
            ) : null}

            <button
              className="w-full rounded-3xl bg-danger/10 px-4 py-4 text-sm font-semibold text-danger transition duration-150 active:scale-[0.99] active:opacity-80"
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Delete task
            </button>
          </div>
        </div>
        {deleteConfirmOpen ? (
          <ConfirmModal
            title={`Delete "${task.title}"?`}
            body={(task.repeatType ?? 'none') !== 'none' ? 'Do you want to delete just this task or all future repeats?' : 'This cannot be undone.'}
            actions={
              (task.repeatType ?? 'none') !== 'none'
                ? [
                    { label: 'Cancel', onClick: () => setDeleteConfirmOpen(false), tone: 'default' },
                    { label: 'This task only', onClick: () => handleDelete('single'), tone: 'primary', disabled: deleteBusy },
                    { label: 'All future', onClick: () => handleDelete('future'), tone: 'danger', disabled: deleteBusy },
                  ]
                : [
                    { label: 'Cancel', onClick: () => setDeleteConfirmOpen(false), tone: 'default' },
                    { label: 'Delete', onClick: () => handleDelete('single'), tone: 'danger', disabled: deleteBusy },
                  ]
            }
            onCancel={() => setDeleteConfirmOpen(false)}
            busy={deleteBusy}
          />
        ) : null}
      </section>
    )
  }

  return (
    <section className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-4xl bg-panel p-5 shadow-card"
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
                setDoneSuggestion(generateDoneSuggestion({ ...task, ...form }))
              }
            }}
            onChange={(event) => {
              setDoneIsSuggested(false)
              suggestedDoneRef.current = ''
              updateField('clarity', event.target.value)
            }}
            placeholder={doneSuggestion || 'What does done look like?'}
          />
          {!form.clarity.trim() && doneSuggestion ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent"
                type="button"
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
            value={form.whyThisMatters}
            onChange={(event) => {
              setWhyTouched(true)
              setWhyIsSuggested(false)
              suggestedWhyRef.current = ''
              updateField('whyThisMatters', event.target.value)
            }}
            placeholder={whySuggestion || 'Why this matters'}
          />
          <div className="flex flex-wrap items-center gap-2">
            {isSuggestionLoading ? (
              <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">Generating suggestions...</p>
            ) : null}
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

          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-3xl px-4 py-3 transition duration-150 active:scale-[0.99] ${form.protected ? 'bg-purple-50 ring-1 ring-purple-200' : 'bg-canvas'}`}
            onClick={() => updateField('protected', !form.protected)}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <Shield size={14} className={form.protected ? 'text-purple-600' : 'text-slate-400'} />
              Protected self-care
            </span>
            <span className={`text-xs font-semibold ${form.protected ? 'text-purple-600' : 'text-slate-400'}`}>
              {form.protected ? 'On' : 'Off'}
            </span>
          </button>

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

            <div className="flex flex-wrap gap-3">
              <button className="min-w-[10rem] flex-1 rounded-3xl bg-ink px-4 py-4 font-semibold text-white" type="submit">
                Save changes
              </button>
              <button className="min-w-[8rem] flex-1 rounded-3xl bg-white px-5 py-4 font-medium text-slate-700 sm:flex-none" type="button" onClick={() => setIsEditing(false)}>
                Back
              </button>
              <button className="min-w-[8rem] flex-1 rounded-3xl bg-white px-5 py-4 font-medium text-slate-700 sm:flex-none" type="button" onClick={onClose}>
                Cancel
              </button>
            </div>

          <button
            className="w-full rounded-3xl bg-danger/10 px-4 py-4 text-sm font-semibold text-danger transition duration-150 active:scale-[0.99] active:opacity-80"
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            Delete task
          </button>
        </form>
        {deleteConfirmOpen ? (
          <ConfirmModal
            title={`Delete "${task.title}"?`}
            body={(task.repeatType ?? 'none') !== 'none' ? 'Do you want to delete just this task or all future repeats?' : 'This cannot be undone.'}
            actions={
              (task.repeatType ?? 'none') !== 'none'
                ? [
                    { label: 'Cancel', onClick: () => setDeleteConfirmOpen(false), tone: 'default' },
                    { label: 'This task only', onClick: () => handleDelete('single'), tone: 'primary', disabled: deleteBusy },
                    { label: 'All future', onClick: () => handleDelete('future'), tone: 'danger', disabled: deleteBusy },
                  ]
                : [
                    { label: 'Cancel', onClick: () => setDeleteConfirmOpen(false), tone: 'default' },
                    { label: 'Delete', onClick: () => handleDelete('single'), tone: 'danger', disabled: deleteBusy },
                  ]
            }
            onCancel={() => setDeleteConfirmOpen(false)}
            busy={deleteBusy}
          />
        ) : null}
      </div>
    </section>
  )
}
