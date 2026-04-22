import { useAuth } from '../contexts/AuthContext'

const FILTERS = [
  { key: 'mine', label: 'Mine' },
  { key: 'partner', label: null }, // label set dynamically
  { key: 'all', label: 'All' },
]

const FilterBar = ({ filter, onChange }) => {
  const { userProfile, partnerProfile } = useAuth()

  const filters = [
    { key: 'mine', label: userProfile?.name ? `${userProfile.name}'s` : 'Mine' },
    {
      key: 'partner',
      label: partnerProfile?.name ? `${partnerProfile.name}'s` : 'Partner',
    },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="flex gap-2 my-3">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${
            filter === f.key
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800/60 text-slate-400 active:bg-slate-700'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

export default FilterBar
