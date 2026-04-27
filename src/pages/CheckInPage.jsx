import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { BOTH_ASSIGNEE_ID, TASK_STATUS } from '../lib/constants'
import { fetchCheckInTaskSuggestions } from '../lib/check-in-ai'
import { buildWeeklyCheckInReview, getWeeklyCheckInOpening } from '../lib/check-in-review'
import { getTaskStatus, isOverdue, toDate } from '../lib/format'
import { getTodayDateKey, getTodayQuestion } from '../lib/daily-dialogue'
import { PageHeader } from './PageHeader'

function isCompletedWithinDays(task, days) {
  const completedAt = toDate(task.completedAt)
  if (!completedAt) return false
  return differenceInCalendarDays(new Date(), completedAt) <= days
}

function isOverdueByDays(task, days) {
  const dueDate = toDate(task.dueDate)
  if (!dueDate) return false
  return differenceInCalendarDays(new Date(), dueDate) > days
}

function compactTaskRow(task, onOpenTask) {
  return (
    <button
      key={task.id}
      className="w-full rounded-2xl bg-canvas px-3 py-2 text-left text-sm text-slate-700 transition duration-150 active:scale-[0.98]"
      type="button"
      onClick={() => onOpenTask(task.id)}
    >
      {task.title}
    </button>
  )
}

export default function CheckInPage({
  tasks,
  filteredTasks,
  sections,
  currentUser,
  partner,
  dateIdeas,
  dateNightSummary,
  onOpenTask,
  onTaskAction,
  onCheckInComplete,
  onSaveDialogueAnswer,
  onQuickAdd,
}) {
  const [checkInSuggestions, setCheckInSuggestions] = useState([])
  const [checkInSuggestionsBusy, setCheckInSuggestionsBusy] = useState(false)
  const [addedSuggestionTitles, setAddedSuggestionTitles] = useState([])
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set())
  const [flowStep, setFlowStep] = useState(null)
  const [appreciation, setAppreciation] = useState('')
  const [dialogueAnswer, setDialogueAnswer] = useState('')
  const [dialogueSaved, setDialogueSaved] = useState(false)

  const draggingTasks = sections?.draggingTasks ?? []
  const dateIdeasById = Object.fromEntries((dateIdeas ?? []).map((idea) => [idea.id, idea]))
  const lastDateNight = dateNightSummary?.lastDate

  const todayKey = getTodayDateKey()
  const todayQuestion = getTodayQuestion()
  const myDialogueAnswerToday = currentUser?.dialogueDateKey === todayKey ? currentUser?.dialogueAnswer ?? '' : ''
  const partnerDialogueAnswerToday = partner?.dialogueDateKey === todayKey ? partner?.dialogueAnswer ?? '' : ''
  const partnerName = partner?.name ?? 'Partner'

  const completedLastWeek = useMemo(
    () => (tasks ?? []).filter((task) => getTaskStatus(task) === TASK_STATUS.COMPLETED && isCompletedWithinDays(task, 7)).slice(0, 4),
    [tasks],
  )
  const overdueTasks = useMemo(
    () => (filteredTasks ?? []).filter((task) => isOverdue(task) && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [filteredTasks],
  )
  const partnerTasks = useMemo(
    () => (filteredTasks ?? []).filter((task) => task.requestedBy && task.requestedBy !== currentUser?.id && getTaskStatus(task) !== TASK_STATUS.COMPLETED).slice(0, 4),
    [filteredTasks, currentUser?.id],
  )
  const discussionTasks = useMemo(() => {
    const seen = new Set()
    return (filteredTasks ?? [])
      .filter((task) => {
        const status = getTaskStatus(task)
        const partnerUntouched = task.requestedBy && task.requestedBy !== currentUser?.id && !task.acknowledgedAt && !task.startedAt
        return status !== TASK_STATUS.COMPLETED && (isOverdueByDays(task, 3) || partnerUntouched)
      })
      .filter((task) => {
        if (seen.has(task.id)) return false
        seen.add(task.id)
        return true
      })
      .slice(0, 4)
  }, [filteredTasks, currentUser?.id])

  const checkInReview = useMemo(
    () => buildWeeklyCheckInReview({ tasks: tasks ?? [], currentUserId: currentUser?.id, partnerId: partner?.id }),
    [tasks, currentUser?.id, partner?.id],
  )
  const checkInOpening = getWeeklyCheckInOpening(checkInReview)

  useEffect(() => {
    const abortController = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setCheckInSuggestionsBusy(true)
      try {
        const suggestions = await fetchCheckInTaskSuggestions(
          { currentUser, partner, completedTasks: completedLastWeek, overdueTasks, partnerTasks, discussionTasks },
          abortController.signal,
        )
        if (!abortController.signal.aborted) setCheckInSuggestions(suggestions)
      } catch (error) {
        if (error.name !== 'AbortError') {
          if (!abortController.signal.aborted) setCheckInSuggestions([])
        }
      } finally {
        if (!abortController.signal.aborted) setCheckInSuggestionsBusy(false)
      }
    }, 300)
    return () => {
      abortController.abort()
      window.clearTimeout(timeoutId)
    }
  }, [completedLastWeek, currentUser, discussionTasks, overdueTasks, partner, partnerTasks])

  function resolveSuggestionAssignee(value) {
    if (value === 'currentUser') return currentUser.id
    if (value === 'partner') return partner?.id ?? BOTH_ASSIGNEE_ID
    if (value === 'both') return BOTH_ASSIGNEE_ID
    return value || BOTH_ASSIGNEE_ID
  }

  async function handleAddCheckInSuggestion(suggestion) {
    const result = await onQuickAdd?.({
      title: suggestion.title,
      notes: suggestion.reason || '',
      assignedTo: resolveSuggestionAssignee(suggestion.assignedTo),
      dueDate: '',
      dueTime: '',
      urgency: 'This week',
      effort: ['Quick', 'Medium', 'Heavy'].includes(suggestion.effort) ? suggestion.effort : 'Quick',
      category: suggestion.category || 'Home',
      clarity: suggestion.doneWhen || '',
      whyThisMatters: suggestion.why || suggestion.reason || '',
      repeatType: 'none',
      repeatDays: [],
    })
    if (!result?.blocked) {
      setAddedSuggestionTitles((current) => [...current, suggestion.title])
    }
  }

  async function handleSaveDialogueAnswer() {
    if (!dialogueAnswer.trim()) return
    await onSaveDialogueAnswer?.({ answer: dialogueAnswer.trim(), dateKey: todayKey })
    setDialogueSaved(true)
  }

  const agenda = checkInReview.agenda

  // ── Guided flow (step-through mode) ──
  if (flowStep !== null && agenda.length) {
    const item = agenda[flowStep]
    const isLast = flowStep === agenda.length - 1

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {flowStep + 1} of {agenda.length}
              </p>
              <button
                className="text-xs font-medium text-slate-500 transition hover:text-slate-700"
                type="button"
                onClick={() => setFlowStep(null)}
              >
                Exit
              </button>
            </div>

            <div className="h-1 w-full rounded-full bg-slate-100">
              <div
                className="h-1 rounded-full bg-accent transition-all duration-300"
                style={{ width: `${((flowStep + 1) / agenda.length) * 100}%` }}
              />
            </div>

            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-100">
              <p className="text-base font-semibold text-ink">{item.title}</p>
              {item.reason ? <p className="mt-2 text-sm text-slate-500">{item.reason}</p> : null}
              {item.suggestedQuestion ? (
                <p className="mt-3 text-sm font-medium text-accent">{item.suggestedQuestion}</p>
              ) : null}
              <button
                className="mt-4 rounded-2xl bg-canvas px-3 py-2 text-xs font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
                type="button"
                onClick={() => onOpenTask(item.id)}
              >
                Open task
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="rounded-3xl bg-white px-4 py-4 text-sm font-medium text-slate-700 ring-1 ring-slate-100 transition duration-150 active:scale-[0.98] disabled:opacity-40"
                type="button"
                disabled={flowStep === 0}
                onClick={() => setFlowStep((s) => s - 1)}
              >
                ← Back
              </button>
              <button
                className="rounded-3xl bg-accent px-4 py-4 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                type="button"
                onClick={() => {
                  if (isLast) {
                    setFlowStep(null)
                  } else {
                    setFlowStep((s) => s + 1)
                  }
                }}
              >
                {isLast ? 'Done ✓' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Browse mode ──
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <PageHeader title="Check-In" body="Review what needs a conversation, then mark it done." />

          {checkInOpening ? (
            <p className="px-1 text-sm font-medium text-slate-700">{checkInOpening}</p>
          ) : null}

          {/* ── Daily Dialogue ── */}
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Daily question</p>
            <p className="mt-2 text-sm font-medium text-ink">{todayQuestion}</p>

            {myDialogueAnswerToday || dialogueSaved ? (
              <div className="mt-3 rounded-2xl bg-accentSoft px-3 py-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-accent">Your answer</p>
                <p className="mt-0.5 text-sm text-accent">{myDialogueAnswerToday || dialogueAnswer}</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <textarea
                  className="w-full rounded-2xl border border-sand bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-accent"
                  rows={2}
                  placeholder="Your answer…"
                  value={dialogueAnswer}
                  onChange={(e) => setDialogueAnswer(e.target.value)}
                />
                {dialogueAnswer.trim() ? (
                  <button
                    className="rounded-2xl bg-accent px-3 py-2 text-xs font-semibold text-white transition duration-150 active:scale-[0.98]"
                    type="button"
                    onClick={handleSaveDialogueAnswer}
                  >
                    Save answer
                  </button>
                ) : null}
              </div>
            )}

            {partnerDialogueAnswerToday ? (
              <div className="mt-3 rounded-2xl bg-canvas px-3 py-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">{partnerName}'s answer</p>
                <p className="mt-0.5 text-sm text-slate-700">{partnerDialogueAnswerToday}</p>
              </div>
            ) : myDialogueAnswerToday ? (
              <p className="mt-2 text-xs text-slate-400">{partnerName} hasn't answered yet.</p>
            ) : null}
          </div>

          {agenda.length ? (
            <>
              <button
                className="w-full rounded-3xl bg-ink px-4 py-4 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                type="button"
                onClick={() => setFlowStep(0)}
              >
                Start discussion — {agenda.length} item{agenda.length === 1 ? '' : 's'}
              </button>

              <div className="space-y-2">
                {agenda.map((item) => (
                  <div key={item.id} className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    {item.reason ? <p className="mt-1 text-xs text-slate-500">{item.reason}</p> : null}
                    {item.suggestedQuestion ? (
                      <p className="mt-2 text-xs font-medium text-accent">{item.suggestedQuestion}</p>
                    ) : null}
                    <button
                      className="mt-3 rounded-2xl bg-canvas px-3 py-2 text-xs font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
                      type="button"
                      onClick={() => onOpenTask(item.id)}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-3xl bg-canvas px-4 py-4 text-sm text-slate-500">
              Nothing needs a conversation right now.
            </div>
          )}

          {checkInReview.completed.length ? (
            <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed this week</p>
              <div className="mt-2 space-y-2">
                {checkInReview.completed.map((task) => compactTaskRow(task, onOpenTask))}
              </div>
            </div>
          ) : null}

          {lastDateNight ? (
            <div className="rounded-3xl bg-accentSoft p-4 text-sm text-accent">
              <p className="font-semibold">Last date night</p>
              <p>
                {dateIdeasById[lastDateNight.ideaId]?.title ?? lastDateNight.taskTitle ?? 'Date night'}
                {lastDateNight.rating ? ` — ${lastDateNight.rating}/5` : ''}
              </p>
              {lastDateNight.notes ? <p className="mt-1 text-xs text-accent/80">{lastDateNight.notes}</p> : null}
            </div>
          ) : null}

          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI suggested tasks</p>
              {checkInSuggestionsBusy ? <span className="text-xs text-slate-500">Loading…</span> : null}
            </div>
            <div className="mt-2 space-y-2">
              {checkInSuggestions.filter((s) => !dismissedSuggestions.has(s.title)).length ? (
                checkInSuggestions
                  .filter((s) => !dismissedSuggestions.has(s.title))
                  .map((suggestion) => {
                    const added = addedSuggestionTitles.includes(suggestion.title)
                    return (
                      <div key={suggestion.title} className="rounded-2xl bg-canvas p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-ink">{suggestion.title}</p>
                          <button
                            className="shrink-0 text-slate-400 transition hover:text-slate-600"
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => setDismissedSuggestions((c) => new Set([...c, suggestion.title]))}
                          >
                            ✕
                          </button>
                        </div>
                        {suggestion.reason ? <p className="mt-1 text-xs text-slate-500">{suggestion.reason}</p> : null}
                        <button
                          className={`mt-3 rounded-2xl px-3 py-2 text-xs font-semibold transition duration-150 active:scale-[0.98] ${added ? 'bg-white text-slate-400' : 'bg-accent text-white'}`}
                          type="button"
                          disabled={added}
                          onClick={() => handleAddCheckInSuggestion(suggestion)}
                        >
                          {added ? 'Added' : 'Add task'}
                        </button>
                      </div>
                    )
                  })
              ) : (
                <p className="text-sm text-slate-500">
                  {checkInSuggestionsBusy ? 'Looking for useful next steps.' : 'No AI suggestions right now.'}
                </p>
              )}
            </div>
          </div>

          {draggingTasks.length ? (
            <div className="space-y-2">
              {draggingTasks.slice(0, 2).map((task) => (
                <div key={task.id} className="rounded-3xl bg-canvas p-4">
                  <button className="text-left text-sm font-medium text-ink" type="button" onClick={() => onOpenTask(task.id)}>
                    {task.title}
                  </button>
                  {task._surfaceReason ? <p className="mt-1 text-xs text-slate-500">{task._surfaceReason}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onTaskAction('reschedule', task)}>
                      Reschedule
                    </button>
                    <button className="rounded-2xl bg-white px-3 py-2 text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={() => onTaskAction('remove', task)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* ── Appreciation exchange ── */}
          <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appreciation</p>
            <p className="mt-1 text-sm text-slate-600">What did you appreciate about {partnerName} this week?</p>
            <textarea
              className="mt-3 w-full rounded-2xl border border-sand bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-accent"
              rows={2}
              placeholder="Something specific — even something small counts."
              value={appreciation}
              onChange={(e) => setAppreciation(e.target.value)}
            />
            {currentUser?.checkIn?.lastAppreciation ? (
              <div className="mt-2 rounded-2xl bg-canvas px-3 py-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">Last week</p>
                <p className="mt-0.5 text-xs text-slate-600 italic">"{currentUser.checkIn.lastAppreciation}"</p>
              </div>
            ) : null}
          </div>

          <button
            className="w-full rounded-2xl bg-accent px-4 py-4 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
            type="button"
            onClick={() => onCheckInComplete(appreciation.trim())}
          >
            Complete check-in
          </button>
        </div>
      </div>
    </div>
  )
}
