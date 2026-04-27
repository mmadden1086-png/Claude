import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from './PageHeader'

const CATEGORIES = [
  { id: 'individual', label: 'Individual', description: 'Personal goals for each of you' },
  { id: 'relationship', label: 'Relationship', description: 'Goals you share as a couple' },
  { id: 'family', label: 'Family', description: 'Goals for your household and family' },
  { id: 'financial', label: 'Financial', description: 'Money, savings, and financial targets' },
]

function progressDisplay(goal) {
  const target = goal.targetAmount || 0
  const current = Math.min(goal.currentAmount || 0, target)
  if (!target) return null
  const percent = Math.round((current / target) * 100)
  const u = goal.unit ? `${goal.unit} ` : ''
  return { current, target, percent, u }
}

function GoalCard({ goal, onEdit, onToggleComplete }) {
  const prog = progressDisplay(goal)
  return (
    <div className={`rounded-2xl border px-4 py-3 transition ${goal.isCompleted ? 'border-slate-100 bg-canvas opacity-60' : 'border-slate-100 bg-white shadow-sm'}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition ${goal.isCompleted ? 'border-accent bg-accent' : 'border-slate-300'}`}
          onClick={() => onToggleComplete(goal)}
          aria-label={goal.isCompleted ? 'Mark incomplete' : 'Mark complete'}
        />
        <button type="button" className="flex-1 text-left" onClick={() => onEdit(goal)}>
          <p className={`text-sm font-semibold ${goal.isCompleted ? 'text-slate-400 line-through' : 'text-ink'}`}>{goal.title}</p>
          {prog ? (
            <div className="mt-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-1.5 rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${prog.percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">{prog.u}{prog.current.toLocaleString()} of {prog.u}{prog.target.toLocaleString()} · {prog.percent}%</p>
            </div>
          ) : null}
        </button>
      </div>
    </div>
  )
}

function GoalSection({ category, goals, currentUser, partner, onAdd, onEdit, onToggleComplete }) {
  const [open, setOpen] = useState(true)
  const Icon = open ? ChevronDown : ChevronRight

  if (category.id === 'individual') {
    const myGoals = goals.filter((g) => g.category === 'individual' && g.ownerId === currentUser?.id)
    const partnerGoals = goals.filter((g) => g.category === 'individual' && g.ownerId === partner?.id)
    const partnerName = partner?.name ?? 'Partner'
    return (
      <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-4"
          onClick={() => setOpen((v) => !v)}
        >
          <div>
            <p className="text-sm font-semibold text-ink">{category.label}</p>
            <p className="text-xs text-slate-400">{category.description}</p>
          </div>
          <Icon size={16} className="text-slate-400" />
        </button>
        {open ? (
          <div className="space-y-4 px-4 pb-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Mine</p>
              <div className="space-y-2">
                {myGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} onEdit={onEdit} onToggleComplete={onToggleComplete} />
                ))}
                {!myGoals.length ? <p className="text-xs text-slate-400">No individual goals yet.</p> : null}
              </div>
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent"
                onClick={() => onAdd({ category: 'individual', ownerId: currentUser?.id })}
              >
                <Plus size={14} /> Add my goal
              </button>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{partnerName}</p>
              <div className="space-y-2">
                {partnerGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} onEdit={onEdit} onToggleComplete={onToggleComplete} />
                ))}
                {!partnerGoals.length ? <p className="text-xs text-slate-400">No goals yet.</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const sectionGoals = goals.filter((g) => g.category === category.id)
  return (
    <div className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-4"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p className="text-sm font-semibold text-ink">{category.label}</p>
          <p className="text-xs text-slate-400">{category.description}</p>
        </div>
        <Icon size={16} className="text-slate-400" />
      </button>
      {open ? (
        <div className="space-y-2 px-4 pb-4">
          {sectionGoals.map((g) => (
            <GoalCard key={g.id} goal={g} onEdit={onEdit} onToggleComplete={onToggleComplete} />
          ))}
          {!sectionGoals.length ? <p className="text-xs text-slate-400">No {category.label.toLowerCase()} goals yet.</p> : null}
          <button
            type="button"
            className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-accent"
            onClick={() => onAdd({ category: category.id, ownerId: null })}
          >
            <Plus size={14} /> Add goal
          </button>
        </div>
      ) : null}
    </div>
  )
}

function GoalModal({ goal, defaults, onClose, onSave, onDelete, busy }) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [category, setCategory] = useState(goal?.category ?? defaults?.category ?? 'relationship')
  const [unit, setUnit] = useState(goal?.unit ?? '')
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? '')
  const [currentAmount, setCurrentAmount] = useState(goal?.currentAmount ?? '')

  const hasTarget = targetAmount !== '' && Number(targetAmount) > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    const target = Number.parseFloat(targetAmount) || 0
    const current = Number.parseFloat(currentAmount) || 0
    onSave({
      title: title.trim(),
      category,
      unit: unit.trim(),
      targetAmount: target,
      currentAmount: target > 0 ? Math.min(current, target) : 0,
      ownerId: goal?.ownerId ?? defaults?.ownerId ?? null,
    })
  }

  return (
    <section
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-[1.75rem] bg-panel p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-ink">{goal ? 'Edit goal' : 'New goal'}</h2>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Goal</span>
            <input
              className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
              type="text"
              placeholder="What are you working toward?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </label>
          {!goal ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
              <select
                className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Unit</span>
              <input
                className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                type="text"
                placeholder="$, mi…"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Target</span>
              <input
                className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                type="number"
                min="0"
                step="any"
                placeholder="—"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">So far</span>
              <input
                className="w-full rounded-2xl border border-sand bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                disabled={!hasTarget}
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-6 space-y-2">
            {goal ? (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-3xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 transition duration-150 active:scale-[0.99] disabled:opacity-50"
                disabled={busy}
                onClick={() => onDelete(goal.id)}
              >
                <Trash2 size={14} /> Delete goal
              </button>
            ) : null}
            <button
              type="button"
              className="w-full rounded-3xl bg-white px-4 py-4 font-medium text-slate-700 transition duration-150 active:scale-[0.99]"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full rounded-3xl bg-accent px-4 py-4 font-medium text-white transition duration-150 active:scale-[0.99] disabled:opacity-60"
              disabled={busy || !title.trim()}
            >
              {busy ? 'Saving…' : goal ? 'Save changes' : 'Add goal'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

export function GoalsPage({ goals = [], currentUser, partner, onCreateGoal, onUpdateGoal, onDeleteGoal }) {
  const [modalDefaults, setModalDefaults] = useState(null)
  const [editingGoal, setEditingGoal] = useState(null)
  const [busy, setBusy] = useState(false)

  function openAdd(defaults) {
    setEditingGoal(null)
    setModalDefaults(defaults)
  }

  function openEdit(goal) {
    setModalDefaults(null)
    setEditingGoal(goal)
  }

  function closeModal() {
    setEditingGoal(null)
    setModalDefaults(null)
  }

  async function handleSave(data) {
    setBusy(true)
    try {
      if (editingGoal) {
        await onUpdateGoal(editingGoal.id, data)
      } else {
        await onCreateGoal({ ...data, createdBy: currentUser?.id })
      }
      closeModal()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(goalId) {
    setBusy(true)
    try {
      await onDeleteGoal(goalId)
      closeModal()
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleComplete(goal) {
    await onUpdateGoal(goal.id, { isCompleted: !goal.isCompleted })
  }

  const modalOpen = Boolean(editingGoal || modalDefaults)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4 pb-24">
          <PageHeader title="Goals" body="Track what you're working toward — individually and together." />
          {CATEGORIES.map((cat) => (
            <GoalSection
              key={cat.id}
              category={cat}
              goals={goals}
              currentUser={currentUser}
              partner={partner}
              onAdd={openAdd}
              onEdit={openEdit}
              onToggleComplete={handleToggleComplete}
            />
          ))}
        </div>
      </div>
      {modalOpen ? (
        <GoalModal
          goal={editingGoal}
          defaults={modalDefaults}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          busy={busy}
        />
      ) : null}
    </div>
  )
}
