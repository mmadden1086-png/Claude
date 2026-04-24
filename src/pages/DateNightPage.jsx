import { useMemo, useState } from 'react'
import { DATE_BUDGET_OPTIONS, DATE_CATEGORY_OPTIONS, DATE_DURATION_OPTIONS, generateDateSuggestions, getDateIdeaPool, pickDateForUs } from '../lib/date-night'
import { PageHeader } from './PageHeader'
import { SectionCard } from '../components/SectionCard'

function matchesIdeaSearch(idea, query) {
  if (!query.trim()) return true
  const normalizedQuery = query.trim().toLowerCase()
  const haystack = [
    idea.title,
    idea.description,
    idea.category,
    idea.budgetLevel,
    idea.duration,
    idea.locationType,
    ...(idea.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalizedQuery)
}

export function DateNightPage({ dateIdeas, dateHistory, monthlyDateStatus, onOpenDateIdeaModal, onSelectDateIdea }) {
  const [dateFilters, setDateFilters] = useState({
    budget: 'Any',
    duration: 'Any',
    category: 'Any',
  })
  const [browseCategory, setBrowseCategory] = useState('Any')
  const [browseBudget, setBrowseBudget] = useState('Any')
  const [searchQuery, setSearchQuery] = useState('')

  const ideaPool = useMemo(() => getDateIdeaPool(dateIdeas ?? []), [dateIdeas])
  const searchedIdeaPool = useMemo(() => ideaPool.filter((idea) => matchesIdeaSearch(idea, searchQuery)), [ideaPool, searchQuery])
  const dateSuggestions = useMemo(() => generateDateSuggestions(searchedIdeaPool, dateHistory ?? [], dateFilters), [dateFilters, dateHistory, searchedIdeaPool])
  const pickedForUs = useMemo(() => pickDateForUs(searchedIdeaPool, dateHistory ?? [], dateFilters), [dateFilters, dateHistory, searchedIdeaPool])
  const fallbackPick = useMemo(
    () => pickDateForUs(searchedIdeaPool.length ? searchedIdeaPool : ideaPool, dateHistory ?? [], { budget: 'Any', duration: 'Any', category: 'Any' }),
    [dateHistory, ideaPool, searchedIdeaPool],
  )
  const visibleIdeas = useMemo(
    () =>
      searchedIdeaPool.filter((idea) => {
        if (browseCategory !== 'Any' && idea.category !== browseCategory) return false
        if (browseBudget !== 'Any' && idea.budgetLevel !== browseBudget) return false
        return true
      }),
    [browseBudget, browseCategory, searchedIdeaPool],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Date Nights"
        body="Store ideas, get a few strong options fast, and track what you want to repeat."
      />

      <SectionCard title="This month">
        <div className="rounded-3xl bg-white p-4">
          <p className="text-sm font-medium text-ink">
            {monthlyDateStatus.status === 'completed'
              ? 'Date night completed this month'
              : monthlyDateStatus.status === 'planned'
                ? 'Date night planned this month'
                : 'No date planned this month'}
          </p>
          {monthlyDateStatus.status !== 'completed' ? (
            <button
              className="mt-3 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white"
              type="button"
              onClick={() => {
                if (pickedForUs?.idea) {
                  onSelectDateIdea(pickedForUs.idea)
                  return
                }
                if (fallbackPick?.idea) {
                  onSelectDateIdea(fallbackPick.idea)
                  return
                }
                onOpenDateIdeaModal()
              }}
            >
              {pickedForUs?.idea || fallbackPick?.idea ? 'Pick for us' : 'Add idea'}
            </button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Generate a date"
        subtitle="Get up to three solid options fast."
        action={(
          <button className="rounded-full bg-white px-3 py-2 text-sm text-slate-600" type="button" onClick={onOpenDateIdeaModal}>
            Add idea
          </button>
        )}
      >
        <label className="flex items-center gap-3 rounded-3xl bg-white px-4 py-3 text-slate-500">
          <input
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
            type="search"
            placeholder="Search date ideas"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery ? (
            <button className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600" type="button" onClick={() => setSearchQuery('')}>
              Clear
            </button>
          ) : null}
        </label>

        <div className="grid grid-cols-3 gap-2">
          <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={dateFilters.budget} onChange={(event) => setDateFilters((current) => ({ ...current, budget: event.target.value }))}>
            {DATE_BUDGET_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={dateFilters.duration} onChange={(event) => setDateFilters((current) => ({ ...current, duration: event.target.value }))}>
            {DATE_DURATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={dateFilters.category} onChange={(event) => setDateFilters((current) => ({ ...current, category: event.target.value }))}>
            {['Any', ...DATE_CATEGORY_OPTIONS].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {dateSuggestions.length ? (
            dateSuggestions.map((entry, index) => (
              <div key={entry.idea.id} className={`rounded-3xl bg-white p-4 ${index === 0 ? 'ring-1 ring-accent/20' : ''}`}>
                <div>
                  <p className="font-medium text-ink">{entry.idea.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{entry.idea.description || 'Simple idea ready when you are.'}</p>
                  <p className="mt-2 text-xs text-slate-500">{[entry.idea.category, entry.idea.budgetLevel, entry.idea.duration].filter(Boolean).join(' - ')}</p>
                  <p className="mt-2 text-sm text-slate-600">{entry.whyFits}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {index === 0 ? <p className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">Best choice</p> : null}
                    {entry.label ? <p className="inline-flex rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">{entry.label}</p> : null}
                  </div>
                </div>
                <button className="mt-3 rounded-2xl bg-accent px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => onSelectDateIdea(entry.idea)}>
                  Choose this
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-3xl bg-white p-4">
              <p className="text-sm text-slate-500">No matches yet</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="rounded-2xl bg-accent px-3 py-3 text-sm font-semibold text-white"
                  type="button"
                  onClick={() => {
                    if (fallbackPick?.idea) {
                      onSelectDateIdea(fallbackPick.idea)
                      return
                    }
                    onOpenDateIdeaModal()
                  }}
                >
                  Pick for us anyway
                </button>
                <button
                  className="rounded-2xl bg-canvas px-3 py-3 text-sm font-medium text-slate-700"
                  type="button"
                  onClick={() => {
                    setDateFilters({ budget: 'Any', duration: 'Any', category: 'Any' })
                    setSearchQuery('')
                  }}
                >
                  Clear filters
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Browse ideas" subtitle="Scroll the full list whenever you want to choose manually.">
        {!dateIdeas?.length ? (
          <div className="rounded-3xl bg-white px-4 py-4 text-sm text-slate-600">
            Starter ideas are ready so this never starts blank.
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={browseCategory} onChange={(event) => setBrowseCategory(event.target.value)}>
            {['Any', ...DATE_CATEGORY_OPTIONS].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={browseBudget} onChange={(event) => setBrowseBudget(event.target.value)}>
            {DATE_BUDGET_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {visibleIdeas.length ? (
            visibleIdeas.slice(0, 20).map((idea) => (
              <div key={idea.id} className="rounded-3xl bg-canvas p-4">
                <p className="font-medium text-ink">{idea.title}</p>
                <p className="mt-1 text-sm text-slate-600">{idea.description || 'Saved for later.'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  {[idea.category, idea.budgetLevel, idea.locationType].filter(Boolean).map((item) => (
                    <span key={`${idea.id}:${item}`} className="rounded-full bg-white px-3 py-1">{item}</span>
                  ))}
                </div>
                <button className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm font-medium text-slate-700" type="button" onClick={() => onSelectDateIdea(idea)}>
                  Choose this
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No saved ideas yet.</p>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
