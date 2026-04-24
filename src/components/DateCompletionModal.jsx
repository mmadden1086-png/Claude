import { useState } from 'react'

export function DateCompletionModal({ task, onClose, onSave, busy = false }) {
  const [sentiment, setSentiment] = useState('up')
  const [rating, setRating] = useState(4)
  const [notes, setNotes] = useState('')
  const [wouldRepeat, setWouldRepeat] = useState(true)

  function handleSentimentChange(nextSentiment) {
    setSentiment(nextSentiment)
    if (nextSentiment === 'up' && rating < 4) setRating(4)
    if (nextSentiment === 'down' && rating > 2) setRating(2)
    if (nextSentiment === 'down') setWouldRepeat(false)
    if (nextSentiment === 'up') setWouldRepeat(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    await onSave({
      ideaId: task.dateIdeaId,
      dateCompleted: new Date().toISOString(),
      rating,
      notes: notes.trim(),
      wouldRepeat,
      taskId: task.id,
      taskTitle: task.title,
    })
  }

  return (
    <section className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
      <form className="w-full max-w-md rounded-4xl bg-panel p-5 shadow-card" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="text-xl font-semibold text-ink">How was "{task.dateIdeaTitle || task.title}"?</h2>
        <p className="mt-2 text-sm text-slate-600">Track the date so better suggestions surface next time.</p>

        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700">Quick reflection</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              className={`rounded-3xl px-4 py-4 text-base font-semibold ${sentiment === 'up' ? 'bg-accent text-white' : 'bg-white text-slate-700'}`}
              type="button"
              onClick={() => handleSentimentChange('up')}
            >
              👍 Good
            </button>
            <button
              className={`rounded-3xl px-4 py-4 text-base font-semibold ${sentiment === 'down' ? 'bg-rose-100 text-rose-700' : 'bg-white text-slate-700'}`}
              type="button"
              onClick={() => handleSentimentChange('down')}
            >
              👎 Not great
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700">Optional rating</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                className={`rounded-2xl px-3 py-3 text-sm font-semibold ${rating === value ? 'bg-accent text-white' : 'bg-white text-slate-700'}`}
                type="button"
                onClick={() => {
                  setRating(value)
                  setSentiment(value >= 4 ? 'up' : value <= 2 ? 'down' : sentiment)
                }}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <textarea className="mt-4 min-h-24 w-full rounded-3xl bg-white px-4 py-3" placeholder="Notes (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} />

        <label className="mt-4 flex items-center gap-3 rounded-3xl bg-white px-4 py-4 text-sm text-slate-700">
          <input type="checkbox" checked={wouldRepeat} onChange={(event) => setWouldRepeat(event.target.checked)} />
          Would do this date again
        </label>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="rounded-3xl bg-white px-4 py-4 font-medium text-slate-700" type="button" onClick={onClose} disabled={busy}>Skip</button>
          <button className="rounded-3xl bg-accent px-4 py-4 font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>Save</button>
        </div>
      </form>
    </section>
  )
}
