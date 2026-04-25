import { useState } from 'react'
import { DATE_BUDGET_OPTIONS, DATE_CATEGORY_OPTIONS, DATE_DURATION_OPTIONS, DATE_LOCATION_OPTIONS } from '../lib/date-night'

function ideaToForm(idea) {
  if (!idea) return { title: '', description: '', category: '', budgetLevel: '', duration: '', locationType: '', tags: '' }
  return {
    title: idea.title ?? '',
    description: idea.description ?? '',
    category: idea.category ?? '',
    budgetLevel: idea.budgetLevel ?? '',
    duration: idea.duration ?? '',
    locationType: idea.locationType ?? '',
    tags: (idea.tags ?? []).join(', '),
  }
}

export function DateIdeaModal({ idea = null, onClose, onSave, busy = false }) {
  const [form, setForm] = useState(() => ideaToForm(idea))
  const isEdit = Boolean(idea)

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    await onSave(form)
  }

  return (
    <section className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center" onClick={busy ? undefined : onClose}>
      <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="text-xl font-semibold text-ink">{isEdit ? 'Edit idea' : 'Add date idea'}</h2>
        <p className="mt-2 text-sm text-slate-600">{isEdit ? 'Update the details for this idea.' : 'Save an idea now so it is easy to pull later.'}</p>

        <div className="mt-5 space-y-3">
          <input className="w-full rounded-3xl bg-white px-4 py-4" placeholder="Title" value={form.title} onChange={(event) => update('title', event.target.value)} />
          <textarea className="min-h-24 w-full rounded-3xl bg-white px-4 py-3" placeholder="Description" value={form.description} onChange={(event) => update('description', event.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <select className="rounded-2xl bg-white px-4 py-3" value={form.category} onChange={(event) => update('category', event.target.value)}>
              <option value="">Category</option>
              {DATE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select className="rounded-2xl bg-white px-4 py-3" value={form.budgetLevel} onChange={(event) => update('budgetLevel', event.target.value)}>
              <option value="">Budget</option>
              {DATE_BUDGET_OPTIONS.filter((option) => option !== 'Any').map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select className="rounded-2xl bg-white px-4 py-3" value={form.duration} onChange={(event) => update('duration', event.target.value)}>
              <option value="">Duration</option>
              {DATE_DURATION_OPTIONS.filter((option) => option !== 'Any').map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select className="rounded-2xl bg-white px-4 py-3" value={form.locationType} onChange={(event) => update('locationType', event.target.value)}>
              <option value="">Location</option>
              {DATE_LOCATION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <input className="w-full rounded-3xl bg-white px-4 py-4" placeholder="Tags (comma separated)" value={form.tags} onChange={(event) => update('tags', event.target.value)} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="rounded-3xl bg-white px-4 py-4 font-medium text-slate-700" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="rounded-3xl bg-accent px-4 py-4 font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>{isEdit ? 'Save changes' : 'Save idea'}</button>
        </div>
      </form>
    </section>
  )
}
