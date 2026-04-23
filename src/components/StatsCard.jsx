import { clsx } from 'clsx'

function DrilldownStat({ label, value, suffix = '', helper, onClick }) {
  return (
    <button
      className={clsx(
        'rounded-3xl bg-accentSoft p-3 text-center transition duration-150 active:scale-[0.98]',
        onClick ? 'shadow-sm hover:shadow-card focus:outline-none focus:ring-2 focus:ring-accent/30' : 'cursor-default',
      )}
      type="button"
      onClick={onClick}
      disabled={!onClick}
    >
      <p className="text-2xl font-semibold text-accent">
        {value}
        {suffix}
      </p>
      <p className="mt-1 text-xs text-slate-600">{label}</p>
      {helper ? <p className="mt-1 text-[0.7rem] text-slate-500">{helper}</p> : null}
    </button>
  )
}

function UserStat({ name, totalPoints, weeklyPoints, onClick }) {
  return (
    <button
      className={clsx(
        'rounded-3xl bg-canvas p-4 text-left transition duration-150 active:scale-[0.98]',
        onClick ? 'shadow-sm hover:shadow-card focus:outline-none focus:ring-2 focus:ring-accent/30' : 'cursor-default',
      )}
      type="button"
      onClick={onClick}
      disabled={!onClick}
    >
      <p className="text-xs uppercase tracking-wide text-slate-500">{name}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{totalPoints ?? 0}</p>
      <p className="text-sm text-slate-600">{weeklyPoints ?? 0} this week</p>
    </button>
  )
}

export function StatsCard({ currentUser, partner, stats, goals, goalProgress, onDrilldown }) {
  return (
    <section className="rounded-4xl border border-white/70 bg-panel/95 p-4 shadow-card">
      <h2 className="text-lg font-semibold text-ink">Stats / Track Record</h2>
      <p className="mt-1 text-sm text-slate-600">Supportive accountability, not a scoreboard.</p>

      <button
        className="mt-4 block w-full rounded-3xl bg-canvas p-4 text-left transition duration-150 active:scale-[0.99]"
        type="button"
        onClick={() => onDrilldown?.({ type: 'goals', focus: 'weekly' })}
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-medium text-slate-700">Weekly progress</p>
          <p className="text-slate-600">
            {stats.weeklyHandled} / {goals.weeklyCompletion}
          </p>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${goalProgress.weeklyPercent}%` }} />
        </div>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <UserStat
          name={currentUser.name}
          totalPoints={currentUser.totalPoints}
          weeklyPoints={currentUser.weeklyPoints}
          onClick={() => onDrilldown?.({ type: 'user-filter', value: 'mine' })}
        />
        <UserStat
          name={partner.name}
          totalPoints={partner.totalPoints}
          weeklyPoints={partner.weeklyPoints}
          onClick={() => onDrilldown?.({ type: 'user-filter', value: 'partner' })}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <DrilldownStat
          label="Completed"
          value={`${stats.weeklyHandled}/${goals.weeklyCompletion}`}
          helper={`${stats.totalCompleted} total`}
          onClick={() => onDrilldown?.({ type: 'goals', focus: 'weekly' })}
        />
        <DrilldownStat
          label="Daily minimum"
          value={`${stats.todayHandled}/${goals.dailyMinimum}`}
          helper="Handled today"
          onClick={() => onDrilldown?.({ type: 'goals', focus: 'daily' })}
        />
        <DrilldownStat label="Days with follow-through" value={stats.daysWithCompletion} onClick={() => onDrilldown?.({ type: 'streak' })} />
        <DrilldownStat label="Tasks in a row" value={stats.taskStreak} onClick={() => onDrilldown?.({ type: 'sequence' })} />
        <DrilldownStat label="Avg completion time" value={stats.avgCompletionHours} suffix="h" onClick={() => onDrilldown?.({ type: 'avg-time' })} />
        <DrilldownStat
          label="Reliability"
          value={stats.reliability}
          suffix="%"
          helper={`Goal ${goals.reliabilityTarget}%`}
          onClick={() => onDrilldown?.({ type: 'goals', focus: 'reliability' })}
        />
        <DrilldownStat label="Open count" value={stats.openCount} onClick={() => onDrilldown?.({ type: 'open' })} />
        <DrilldownStat label="Missed" value={stats.missedCount} onClick={() => onDrilldown?.({ type: 'missed' })} />
      </div>
    </section>
  )
}
