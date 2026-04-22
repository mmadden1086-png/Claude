import { useState, useRef, useEffect } from 'react'
import { useTasks } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'
import { suggestClarity } from '../utils/clarityEngine'
import { suggestRepeat, REPEAT_OPTIONS, DAY_OPTIONS } from '../utils/repeatLogic'

const EFFORT_OPTIONS = ['Quick', 'Medium', 'Heavy']
const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const QuickAdd = () => {
  const { addTask } = useTasks()
  const { currentUser, userProfile, partnerProfile } = useAuth()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [clarity, setClarity] = useState('')
  const [claritySuggestion, setClaritySuggestion] = useState('')
  const [clarityEdited, setClarityEdited] = useState(false)
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [effort, setEffort] = useState('Medium')
  const [urgency, setUrgency] = useState('medium')
  const [repeatType, setRepeatType] = useState('none')
  const [repeatDays, setRepeatDays] = useState([])
  const [whyThisMatters, setWhyThisMatters] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    if (currentUser) setAssignedTo(currentUser.uid)
  }, [currentUser])

  // Auto-suggest clarity from title
  useEffect(() => {
    const suggested = suggestClarity(title)
    setClaritySuggestion(suggested)
    if (!clarityEdited && suggested) setClarity(suggested)
    else if (!clarityEdited) setClarity('')
  }, [title, clarityEdited])

  // Auto-suggest repeat from title
  useEffect(() => {
    const suggested = suggestRepeat(title)
    if (suggested && repeatType === 'none') setRepeatType(suggested)
  }, [title])

  const open_ = () => {
    setOpen(true)
    setTimeout(() => titleRef.current?.focus(), 100)
  }

  const reset = () => {
    setTitle('')
    setNotes('')
    setClarity('')
    setClaritySuggestion('')
    setClarityEdited(false)
    setDueDate('')
    setDueTime('')
    setEffort('Medium')
    setUrgency('medium')
    setRepeatType('none')
    setRepeatDays([])
    setWhyThisMatters('')
    setAssignedTo(currentUser?.uid || '')
    setOpen(false)
  }

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await addTask({
        title: title.trim(),
        notes: notes.trim(),
        clarity: clarity.trim(),
        whyThisMatters: whyThisMatters.trim(),
        assignedTo,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        effort,
        urgency,
        repeatType,
        repeatDays,
      })
      reset()
    } finally {
      setSaving(false)
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  const toggleRepeatDay = (day) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  if (!open) {
    return (
      <button
        onClick={open_}
        className="w-full flex items-center gap-3 bg-slate-800/60 rounded-2xl px-4 py-4 text-slate-400 text-left min-h-[56px] active:bg-slate-700/60"
      >
        <span className="text-2xl leading-none text-slate-500">+</span>
        <span className="text-[15px]">Add a task…</span>
      </button>
    )
  }

  return (
    <div className="bg-slate-800/80 rounded-2xl p-4 space-y-3">
      {/* Title */}
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleTitleKeyDown}
        placeholder="What needs to happen?"
        className="w-full bg-transparent text-white placeholder-slate-500 text-[15px] font-medium outline-none min-h-[44px]"
      />

      {/* Assignee */}
      {partnerProfile && (
        <div className="flex gap-2">
          <button
            onClick={() => setAssignedTo(currentUser.uid)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px] ${
              assignedTo === currentUser.uid
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {userProfile?.name || 'Me'}
          </button>
          <button
            onClick={() => setAssignedTo(partnerProfile.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px] ${
              assignedTo === partnerProfile.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {partnerProfile.name}
          </button>
        </div>
      )}

      {/* Due date + time */}
      <div className="flex gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="flex-1 bg-slate-700 text-white rounded-xl px-3 py-2 text-sm min-h-[44px] outline-none"
        />
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          className="w-28 bg-slate-700 text-white rounded-xl px-3 py-2 text-sm min-h-[44px] outline-none"
        />
      </div>

      {/* Effort */}
      <div className="flex gap-2">
        {EFFORT_OPTIONS.map((e) => (
          <button
            key={e}
            onClick={() => setEffort(e)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px] ${
              effort === e ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Urgency */}
      <div className="flex gap-2">
        {URGENCY_OPTIONS.map((u) => (
          <button
            key={u.value}
            onClick={() => setUrgency(u.value)}
            className={`flex-1 py-2 rounded-xl text-sm min-h-[44px] ${
              urgency === u.value ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {/* Repeat */}
      <select
        value={repeatType}
        onChange={(e) => setRepeatType(e.target.value)}
        className="w-full bg-slate-700 text-white rounded-xl px-3 py-2 text-sm min-h-[44px] outline-none"
      >
        {REPEAT_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      {repeatType === 'specific' && (
        <div className="flex gap-1.5 flex-wrap">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => toggleRepeatDay(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium min-h-[36px] ${
                repeatDays.includes(d) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Clarity */}
      <div>
        <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">
          Done looks like
        </label>
        <input
          type="text"
          value={clarity}
          onChange={(e) => {
            setClarity(e.target.value)
            setClarityEdited(true)
          }}
          placeholder={claritySuggestion || 'What does done look like?'}
          className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-xl px-3 py-2.5 text-sm min-h-[44px] outline-none"
        />
        {claritySuggestion && !clarityEdited && (
          <p className="text-xs text-slate-500 mt-1">Suggested — tap to edit</p>
        )}
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
      />

      {/* Why it matters */}
      <input
        type="text"
        value={whyThisMatters}
        onChange={(e) => setWhyThisMatters(e.target.value)}
        placeholder="Why this matters (optional)"
        className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-xl px-3 py-2.5 text-sm min-h-[44px] outline-none"
      />

      {/* Submit / Cancel */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          className="flex-1 py-3 bg-blue-600 rounded-xl text-white font-semibold text-sm min-h-[48px] disabled:opacity-40 active:bg-blue-700"
        >
          {saving ? 'Adding…' : 'Add task'}
        </button>
        <button
          onClick={reset}
          className="py-3 px-5 bg-slate-700 rounded-xl text-slate-300 text-sm min-h-[48px] active:bg-slate-600"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default QuickAdd
