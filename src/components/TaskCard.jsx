import { Check, ChevronRight, Clock3, Play } from 'lucide-react'
import { clsx } from 'clsx'
import { TASK_STATUS } from '../lib/constants'
import { formatDueContext, getTaskStatus, isDueWithinHours, isOverdue, isSnoozed } from '../lib/format'
import { shouldShowFrictionFix } from '../lib/task-decision'
import { getWhyDisplayDecision } from '../lib/why-strength'

function getTaskFlags(task) {
  const flags = []

  if (task.isMissed) flags.push({ label: 'Missed', tone: 'danger' })
  if (isOverdue(task)) flags.push({ label: 'Overdue', tone: 'danger' })
  if (!isOverdue(task) && isDueWithinHours(task, 0, 4)) flags.push({ label: 'Due soon', tone: 'amber' })
  if ((task.snoozeCount ?? 0) >= 2 || shouldShowFrictionFix(task)) flags.push({ label: 'Needs attention', tone: 'amber' })
  if (isSnoozed(task)) flags.push({ label: 'Snoozed', tone: 'slate' })

  return flags
}

function pillClass(tone) {
  if (tone === 'danger') return 'bg-rose-50 text-rose-700'
  if (tone === 'amber') return 'bg-amber-50 text-amber-700'
  if (tone === 'accent') return 'bg-accentSoft text-accent'
  return 'bg-slate-100 text-slate-600'
}

function firstLine(value) {
  return value?.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}

function shortImpactMessage(task, currentUser) {
  const whyDecision = getWhyDisplayDecision(task, task.whyThisMatters, currentUser.id)
  const impact = firstLine(whyDecision.text)

  if (!impact && getTaskStatus(task) === TASK_STATUS.COMPLETED) return 'Completed and logged'
  if (!impact) return 'Needs attention soon'
  return impact.length > 96 ? `${impact.slice(0, 93).trim()}...` : impact
}

function meaningfulClarity(task) {
  if (!task.clarity?.trim()) return ''
  return task.clarity.trim()
}

export function TaskCard({ task, currentUser, onAction, onOpen, variant = 'list' }) {
  const status = getTaskStatus(task)
  const whyDecision = getWhyDisplayDecision(task, task.whyThisMatters, currentUser.id)
  const impactMessage = shortImpactMessage(task, currentUser)
  const isFocus = variant === 'focus'
  const clarity = meaningfulClarity(task)

  const isStuck = (task.snoozeCount ?? 0) >= 2 || shouldShowFrictionFix(task) || isOverdue(task)

  function stopAndRun(event, action) {
    event.stopPropagation()
    onAction(action, task)
  }

  if (!isFocus) return null

  return (
    <div className="rounded-2xl border p-4 bg-white">
      <h2 className="text-lg font-semibold">{task.title}</h2>
      {impactMessage && <p className="text-sm text-gray-600">{impactMessage}</p>}

      {clarity && (
        <div className="mt-2 text-sm">
          <div className="text-xs text-gray-500">Done when</div>
          <div>{clarity}</div>
        </div>
      )}

      {isStuck && (
        <div className="mt-3 p-3 bg-amber-50 rounded-xl">
          <div className="text-sm font-medium mb-2">This hasn’t moved. Fix it?</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={(e)=>stopAndRun(e,'break')} className="px-3 py-2 border rounded">Break it down</button>
            <button onClick={(e)=>stopAndRun(e,'reschedule')} className="px-3 py-2 border rounded">Change timing</button>
            <button onClick={(e)=>stopAndRun(e,'reassign')} className="px-3 py-2 border rounded">Reassign</button>
            <button onClick={(e)=>stopAndRun(e,'remove')} className="px-3 py-2 border rounded text-red-600">Drop it</button>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={(e)=>stopAndRun(e,'start')} className="flex-1 bg-blue-600 text-white py-2 rounded">Start</button>
        <button onClick={(e)=>stopAndRun(e,'done')} className="flex-1 border py-2 rounded">Done</button>
      </div>
    </div>
  )
}
