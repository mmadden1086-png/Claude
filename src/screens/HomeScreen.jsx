import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTasks } from '../contexts/TaskContext'
import {
  getActiveTasks,
  getSnoozedTasks,
  getCompletedTasks,
  getNeedsAttentionTasks,
  getFutureTasks,
  getUndatedTasks,
  sortByPriority,
  isDueToday,
  isDueThisWeek,
  isOverdue,
} from '../utils/prioritization'
import { subscribeForegroundMessages } from '../lib/messaging'

import QuickAdd from '../components/QuickAdd'
import DoThisNext from '../components/DoThisNext'
import MorningBanner from '../components/MorningBanner'
import FilterBar from '../components/FilterBar'
import TaskSection from '../components/TaskSection'
import WeeklyGoalBar from '../components/WeeklyGoalBar'
import EveningWrapUp from '../components/EveningWrapUp'
import WeeklyCheckIn from '../components/WeeklyCheckIn'
import LowEnergyBanner from '../components/LowEnergyBanner'
import NotificationButton from '../components/NotificationButton'
import ToastContainer from '../components/ToastContainer'

const HomeScreen = () => {
  const { currentUser, userProfile, partnerProfile, logout } = useAuth()
  const { tasks } = useTasks()
  const navigate = useNavigate()

  const [filter, setFilter] = useState('mine')
  const [focusMode, setFocusMode] = useState(false)
  const [lowEnergy, setLowEnergy] = useState(false)
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  // Subscribe to foreground FCM messages
  useEffect(() => {
    let unsub
    subscribeForegroundMessages((payload) => {
      console.log('FCM foreground:', payload)
    }).then((fn) => {
      unsub = fn
    })
    return () => unsub?.()
  }, [])

  // ─── Filter tasks by assignee ─────────────────────────────────────────────

  const filterTasks = (list) => {
    if (filter === 'mine') return list.filter((t) => t.assignedTo === currentUser?.uid)
    if (filter === 'partner') return list.filter((t) => t.assignedTo !== currentUser?.uid)
    return list
  }

  const applyLowEnergy = (list) => {
    if (!lowEnergy) return list
    return [...list].sort((a, b) => {
      const effortOrder = { Quick: 0, Medium: 1, Heavy: 2 }
      return (effortOrder[a.effort] ?? 1) - (effortOrder[b.effort] ?? 1)
    })
  }

  const active = getActiveTasks(tasks)
  const snoozed = getSnoozedTasks(tasks)
  const completed = getCompletedTasks(tasks)

  const filteredActive = applyLowEnergy(
    sortByPriority(filterTasks(active), currentUser?.uid)
  )

  const needsAttention = filterTasks(getNeedsAttentionTasks(tasks))
  const overdueList = filteredActive.filter(isOverdue)
  const todayList = filteredActive.filter((t) => !isOverdue(t) && isDueToday(t))
  const thisWeekList = filteredActive.filter((t) => !isOverdue(t) && !isDueToday(t) && isDueThisWeek(t))
  const futureList = filterTasks(getFutureTasks(tasks))
  const undatedList = filteredActive.filter((t) => !t.dueDate && !isOverdue(t))
  const snoozedFiltered = filterTasks(snoozed)
  const recentlyCompleted = filterTasks(completed)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 10)

  return (
    <div className="min-h-screen bg-slate-900 pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800/60 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="font-bold text-white text-[17px] tracking-tight">Follow Through</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFocusMode((v) => !v)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium min-h-[36px] ${
                focusMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              Focus
            </button>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="w-9 h-9 flex items-center justify-center text-slate-400 text-xl"
            >
              ⋯
            </button>
          </div>
        </div>

        {/* Dropdown menu */}
        {showMenu && (
          <div className="absolute right-4 top-14 bg-slate-800 rounded-2xl shadow-xl z-40 py-2 min-w-[180px] border border-slate-700/60">
            <button
              onClick={() => { navigate('/stats'); setShowMenu(false) }}
              className="w-full text-left px-4 py-3 text-sm text-white min-h-[44px]"
            >
              Track Record
            </button>
            <button
              onClick={() => { setShowCheckIn(true); setShowMenu(false) }}
              className="w-full text-left px-4 py-3 text-sm text-white min-h-[44px]"
            >
              Weekly Check-In
            </button>
            <div className="h-px bg-slate-700 my-1" />
            <button
              onClick={() => { logout(); setShowMenu(false) }}
              className="w-full text-left px-4 py-3 text-sm text-slate-400 min-h-[44px]"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        {/* Morning banner */}
        <MorningBanner />

        {/* Quick add */}
        <QuickAdd />

        {/* Do This Next */}
        <DoThisNext focusMode={focusMode} />

        {/* Focus mode: only show DoThisNext */}
        {!focusMode && (
          <>
            {/* Weekly goal */}
            <WeeklyGoalBar />

            {/* Low energy toggle */}
            <LowEnergyBanner active={lowEnergy} onToggle={() => setLowEnergy((v) => !v)} />

            {/* Filter */}
            <FilterBar filter={filter} onChange={setFilter} />

            {/* Needs Attention */}
            {needsAttention.length > 0 && (
              <TaskSection
                title="Needs Attention"
                tasks={needsAttention}
                defaultOpen
              />
            )}

            {/* Overdue */}
            {overdueList.length > 0 && (
              <TaskSection
                title="Overdue"
                tasks={overdueList}
                defaultOpen
              />
            )}

            {/* Today */}
            {todayList.length > 0 && (
              <TaskSection
                title="Today"
                tasks={todayList}
                defaultOpen
              />
            )}

            {/* This Week */}
            {thisWeekList.length > 0 && (
              <TaskSection
                title="This Week"
                tasks={thisWeekList}
                defaultOpen
              />
            )}

            {/* No due date */}
            {undatedList.length > 0 && (
              <TaskSection
                title="Open Tasks"
                tasks={undatedList}
                defaultOpen
                showAging
              />
            )}

            {/* Future */}
            <TaskSection
              title="Future"
              tasks={futureList}
              defaultOpen={false}
              showAging={false}
            />

            {/* Snoozed */}
            <TaskSection
              title="Snoozed"
              tasks={snoozedFiltered}
              defaultOpen={false}
            />

            {/* Recently handled */}
            <TaskSection
              title="Recently Handled"
              tasks={recentlyCompleted}
              defaultOpen={false}
              showAging={false}
            />

            {/* Evening wrap-up */}
            <EveningWrapUp />

            {/* Notifications */}
            <NotificationButton />
          </>
        )}
      </main>

      {/* Weekly check-in modal */}
      {showCheckIn && <WeeklyCheckIn onClose={() => setShowCheckIn(false)} />}

      {/* Toast notifications */}
      <ToastContainer />

      {/* Tap-away to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  )
}

export default HomeScreen
