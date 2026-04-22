const LowEnergyBanner = ({ active, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm transition-colors min-h-[48px] ${
      active
        ? 'bg-amber-900/40 text-amber-300 border border-amber-800/40'
        : 'bg-slate-800/60 text-slate-400'
    }`}
  >
    <span>{active ? 'Low Energy Mode — showing quick wins' : 'Low Energy Mode'}</span>
    <span className={`text-xs font-medium ${active ? 'text-amber-400' : 'text-slate-500'}`}>
      {active ? 'ON' : 'OFF'}
    </span>
  </button>
)

export default LowEnergyBanner
