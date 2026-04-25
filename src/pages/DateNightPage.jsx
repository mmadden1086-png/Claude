import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DATE_BUDGET_OPTIONS, DATE_CATEGORY_OPTIONS, DATE_DURATION_OPTIONS, generateDateSuggestions, getDateIdeaPool, groupDateIdeas, pickDateForUs } from '../lib/date-night'
import { toDate } from '../lib/format'
import { PageHeader } from './PageHeader'
import { SectionCard } from '../components/SectionCard'

const ACTIVE_PREVIEW_LIMIT = 5

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

function IdeaCard({ idea, onSelect, onEdit, onArchive, onUnarchive, isArchived = false }) {
  const meta = [idea.category, idea.budgetLevel, idea.duration, idea.locationType].filter(Boolean)
  return (
    <div className="rounded-3xl bg-canvas p-4">
      <p className="font-medium text-ink">{idea.title}</p>
      {idea.description ? <p className="mt-1 text-sm text-slate-600">{idea.description}</p> : null}
      {meta.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {meta.map((item) => (
            <span key={`${idea.id}:${item}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{item}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!isArchived && (
          <button
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
            type="button"
            onClick={() => onSelect(idea)}
          >
            Choose
          </button>
        )}
        {onEdit && (
          <button
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
            type="button"
            onClick={() => onEdit(idea)}
          >
            Edit
          </button>
        )}
        {isArchived ? (
          <button
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
            type="button"
            onClick={() => onUnarchive(idea)}
          >
            Show again
          </button>
        ) : (
          <button
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition duration-150 active:scale-[0.98]"
            type="button"
            onClick={() => onArchive(idea)}
          >
            Hide
          </button>
        )}
      </div>
    </div>
  )
}

function CollapsibleGroup({ title, count, open, onToggle, children }) {
  return (
    <div className="rounded-3xl bg-white p-4">
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        type="button"
        onClick={onToggle}
      >
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <span>{count}</span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && count > 0 ? (
        <div className="mt-3 space-y-3">{children}</div>
      ) : null}
    </div>
  )
}

export function DateNightPage({
  dateIdeas,
  dateHistory,
  monthlyDateStatus,
  onOpenDateIdeaModal,
  onSelectDateIdea,
  onEditDateIdea,
  onArchiveDateIdea,
  onUnarchiveDateIdea,
  onCancelPlannedDate,
}) {
  const [dateFilters, setDateFilters] = useState({ budget: 'Any', duration: 'Any', category: 'Any' })
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllActive, setShowAllActive] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)

  const ideaPool = useMemo(() => getDateIdeaPool(dateIdeas ?? []), [dateIdeas])
  const searchedIdeaPool = useMemo(() => ideaPool.filter((idea) => matchesIdeaSearch(idea, searchQuery)), [ideaPool, searchQuery])
  const dateSuggestions = useMemo(() => generateDateSuggestions(searchedIdeaPool, dateHistory ?? [], dateFilters), [dateFilters, dateHistory, searchedIdeaPool])
  const pickedForUs = useMemo(() => pickDateForUs(searchedIdeaPool, dateHistory ?? [], dateFilters), [dateFilters, dateHistory, searchedIdeaPool])
  const fallbackPick = useMemo(
    () => pickDateForUs(searchedIdeaPool.length ? searchedIdeaPool : ideaPool, dateHistory ?? [], { budget: 'Any', duration: 'Any', category: 'Any' }),
    [dateHistory, ideaPool, searchedIdeaPool],
  )
  const { active, recentlyUsed, archived } = useMemo(
    () => groupDateIdeas(dateIdeas ?? [], dateHistory ?? []),
    [dateIdeas, dateHistory],
  )
  const activeToShow = showAllActive ? active : active.slice(0, ACTIVE_PREVIEW_LIMIT)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <PageHeader
            title="Date Nights"
            body="Store ideas, get a few strong options fast, and track what you want to repeat."
          />

          <SectionCard title="This month">
            <div className="rounded-3xl bg-white p-4">
              <p className="text-sm font-medium text-ink">
                {monthlyDateStatus.status === 'completed'
                  ? 'Completed this month'
                  : monthlyDateStatus.status === 'planned'
                    ? `Date planned: ${toDate(monthlyDateStatus.plannedTask?.dueDate)?.toLocaleDateString() ?? 'This month'}`
                    : 'No date planned this month'}
              </p>
              <button
                className="mt-3 w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]"
                type="button"
                onClick={() => {
                  if (pickedForUs?.idea) { onSelectDateIdea(pickedForUs.idea); return }
                  if (fallbackPick?.idea) { onSelectDateIdea(fallbackPick.idea); return }
                  onOpenDateIdeaModal()
                }}
              >
                Pick for us
              </button>
              {monthlyDateStatus.status === 'planned' && monthlyDateStatus.plannedTask ? (
                <button
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98]"
                  type="button"
                  onClick={() => onCancelPlannedDate?.(monthlyDateStatus.plannedTask)}
                >
                  Cancel date
                </button>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Generate a date"
            subtitle="Get up to three solid options fast."
            action={(
              <button className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={onOpenDateIdeaModal}>
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
                <button className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-slate-600" type="button" onClick={() => setSearchQuery('')}>Clear</button>
              ) : null}
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={dateFilters.budget} onChange={(event) => setDateFilters((current) => ({ ...current, budget: event.target.value }))}>
                {DATE_BUDGET_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={dateFilters.duration} onChange={(event) => setDateFilters((current) => ({ ...current, duration: event.target.value }))}>
                {DATE_DURATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-700" value={dateFilters.category} onChange={(event) => setDateFilters((current) => ({ ...current, category: event.target.value }))}>
                {['Any', ...DATE_CATEGORY_OPTIONS].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              {dateSuggestions.length ? (
                dateSuggestions.map((entry, index) => (
                  <div key={entry.idea.id} className={`rounded-3xl bg-white p-4 ${index === 0 ? 'ring-1 ring-accent/20' : ''}`}>
                    <p className="font-medium text-ink">{entry.idea.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{entry.idea.description || 'Simple idea ready when you are.'}</p>
                    <p className="mt-2 text-xs text-slate-500">{[entry.idea.category, entry.idea.budgetLevel, entry.idea.duration, entry.idea.locationType].filter(Boolean).join(' - ')}</p>
                    <p className="mt-2 text-sm text-slate-600">{entry.whyFits}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {index === 0 ? <p className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">Best choice</p> : null}
                      {entry.label ? <p className="inline-flex rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">{entry.label}</p> : null}
                    </div>
                    <button className="mt-3 w-full rounded-2xl bg-accent px-3 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]" type="button" onClick={() => onSelectDateIdea(entry.idea)}>
                      Choose this
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl bg-white p-4">
                  <p className="text-sm text-slate-500">No matches yet</p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button
                      className="w-full rounded-2xl bg-accent px-3 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98] sm:flex-1"
                      type="button"
                      onClick={() => {
                        if (fallbackPick?.idea) { onSelectDateIdea(fallbackPick.idea); return }
                        onOpenDateIdeaModal()
                      }}
                    >
                      Pick for us anyway
                    </button>
                    <button
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-700 transition duration-150 active:scale-[0.98] sm:flex-1"
                      type="button"
                      onClick={() => { setDateFilters({ budget: 'Any', duration: 'Any', category: 'Any' }); setSearchQuery('') }}
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Your ideas"
            subtitle="Tap Edit to update, Hide to archive."
            action={(
              <button className="rounded-full bg-white px-3 py-2 text-sm text-slate-600 transition duration-150 active:scale-[0.98]" type="button" onClick={onOpenDateIdeaModal}>
                Add idea
              </button>
            )}
          >
            {!(dateIdeas?.length) ? (
              <div className="rounded-3xl bg-white p-4">
                <p className="text-sm text-slate-500">No ideas saved yet.</p>
                <button className="mt-3 w-full rounded-2xl bg-accent px-3 py-3 text-sm font-semibold text-white transition duration-150 active:scale-[0.98]" type="button" onClick={onOpenDateIdeaModal}>
                  Add your first idea
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {active.length > 0 ? (
                  <div className="space-y-3">
                    {activeToShow.map((idea) => (
                      <IdeaCard
                        key={idea.id}
                        idea={idea}
                        onSelect={onSelectDateIdea}
                        onEdit={onEditDateIdea}
                        onArchive={onArchiveDateIdea}
                        onUnarchive={onUnarchiveDateIdea}
                      />
                    ))}
                    {active.length > ACTIVE_PREVIEW_LIMIT && !showAllActive ? (
                      <button
                        className="w-full rounded-3xl bg-white px-4 py-3 text-sm font-medium text-slate-600 transition duration-150 active:scale-[0.98]"
                        type="button"
                        onClick={() => setShowAllActive(true)}
                      >
                        View all {active.length} ideas
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-3xl bg-white px-4 py-4 text-sm text-slate-500">All ideas are archived or recently used.</div>
                )}

                {recentlyUsed.length > 0 ? (
                  <CollapsibleGroup
                    title="Recently used"
                    count={recentlyUsed.length}
                    open={recentOpen}
                    onToggle={() => setRecentOpen((current) => !current)}
                  >
                    {recentlyUsed.map((idea) => (
                      <IdeaCard
                        key={idea.id}
                        idea={idea}
                        onSelect={onSelectDateIdea}
                        onEdit={onEditDateIdea}
                        onArchive={onArchiveDateIdea}
                        onUnarchive={onUnarchiveDateIdea}
                      />
                    ))}
                  </CollapsibleGroup>
                ) : null}

                {archived.length > 0 ? (
                  <CollapsibleGroup
                    title="Archived"
                    count={archived.length}
                    open={archivedOpen}
                    onToggle={() => setArchivedOpen((current) => !current)}
                  >
                    {archived.map((idea) => (
                      <IdeaCard
                        key={idea.id}
                        idea={idea}
                        onSelect={onSelectDateIdea}
                        onEdit={onEditDateIdea}
                        onArchive={onArchiveDateIdea}
                        onUnarchive={onUnarchiveDateIdea}
                        isArchived
                      />
                    ))}
                  </CollapsibleGroup>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
