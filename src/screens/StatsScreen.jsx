import { useNavigate } from 'react-router-dom'
import { isThisWeek, isThisMonth, differenceInDays, format } from 'date-fns'
import { useTasks } from '../contexts/TaskContext'
import { useAuth } from '../contexts/AuthContext'

const Stat = ({ label, value, sub }) => (
  <div className="bg-slate-800/60 rounded-2xl p-4">
    <p className="text-3xl font-bold text-white">{value}</p>
    <p className="text-sm text-slate-400 mt-0.5">{label}</p>
    {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
  </div>
)

const StatsScreen = () => {
  const navigate = useNavigate()
  const { tasks } = useTasks()
  const { currentUser, userProfile, partnerProfile } = useAuth()

  const completed = tasks.filter((t) => t.isCompleted)
  const myCompleted = completed.filter((t) => t.completedAt)

  const thisWeek = myCompleted.filter(
    (t) => t.completedAt instanceof Date && isThisWeek(t.completedAt, { weekStartsOn: 0 })
  )
  const thisMonth = myCompleted.filter(
    (t) => t.completedAt instanceof Date && isThisMonth(t.completedAt)
  )

  // Streak: consecutive days with at least one completion
  const completedDays = new Set(
    myCompleted
      .filter((t) => t.completedAt instanceof Date)
      .map((t) => format(t.completedAt, 'yyyy-MM-dd'))
  )

  let streak = 0
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = format(d, 'yyyy-MM-dd')
    if (completedDays.has(key)) streak++
    else if (i > 0) break
  }

  // Points
  const myPoints = userProfile?.totalPoints || 0
  const partnerPoints = partnerProfile?.totalPoints || 0
  const myWeeklyPoints = userProfile?.weeklyPoints || 0

  // Tasks in a row (consecutive completions regardless of day)
  const sorted = myCompleted
    .filter((t) => t.completedAt instanceof Date)
    .sort((a, b) => b.completedAt - a.completedAt)
  let inARow = 0
  for (const t of sorted) {
    const age = differenceInDays(new Date(), t.completedAt)
    if (age <= inARow + 1) inARow++
    else break
  }

  // By category
  const byCategory = {}
  for (const t of myCompleted) {
    const cat = t.category || 'Uncategorized'
    byCategory[cat] = (byCategory[cat] || 0) + 1
  }
  const categories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Recent 7 days bar chart data
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    const key = format(d, 'yyyy-MM-dd')
    return {
      label: format(d, 'EEE'),
      count: myCompleted.filter(
        (t) => t.completedAt instanceof Date && format(t.completedAt, 'yyyy-MM-dd') === key
      ).length,
    }
  })
  const maxDay = Math.max(1, ...last7.map((d) => d.count))

  return (
    <div className="min-h-screen bg-slate-900 pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/')}
            className="text-blue-400 text-sm min-h-[44px] px-1 flex items-center"
          >
            ← Back
          </button>
          <h1 className="font-bold text-white text-[17px]">Track Record</h1>
        </div>
      </header>

      <main className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        {/* Top stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="This week"
            value={thisWeek.length}
            sub={`${myWeeklyPoints} pts`}
          />
          <Stat
            label="This month"
            value={thisMonth.length}
          />
          <Stat
            label="Total handled"
            value={myCompleted.length}
            sub={`${myPoints} pts all-time`}
          />
          <Stat
            label="Day streak"
            value={streak}
            sub={streak === 1 ? 'day' : 'days'}
          />
        </div>

        {/* Combined points */}
        <div className="bg-slate-800/60 rounded-2xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Points this week</p>
          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-lg font-bold text-white">{userProfile?.weeklyPoints || 0}</p>
              <p className="text-sm text-slate-400">{userProfile?.name || 'You'}</p>
            </div>
            {partnerProfile && (
              <div className="flex-1">
                <p className="text-lg font-bold text-white">{partnerProfile?.weeklyPoints || 0}</p>
                <p className="text-sm text-slate-400">{partnerProfile?.name || 'Partner'}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-3">
            Points are for momentum, not competition.
          </p>
        </div>

        {/* Last 7 days bar chart */}
        <div className="bg-slate-800/60 rounded-2xl p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-4">Last 7 days</p>
          <div className="flex items-end gap-1.5 h-20">
            {last7.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-blue-600/70 rounded-sm"
                  style={{ height: `${(d.count / maxDay) * 64}px`, minHeight: d.count > 0 ? '4px' : '0' }}
                />
                <span className="text-xs text-slate-500">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="bg-slate-800/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Top categories</p>
            <div className="space-y-2">
              {categories.map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{cat}</span>
                  <span className="text-sm text-slate-400 font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly goal */}
        <div className="bg-slate-800/60 rounded-2xl p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Weekly goal</p>
            <p className="text-sm font-semibold text-white">
              {thisWeek.length} / 10 handled
            </p>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(100, thisWeek.length * 10)}%` }}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default StatsScreen
