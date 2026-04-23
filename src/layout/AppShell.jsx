import { Activity, ClipboardList, Heart, Menu, Target } from 'lucide-react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ActivityPage } from '../pages/ActivityPage'
import { DateNightPage } from '../pages/DateNightPage'
import { FocusPage } from '../pages/FocusPage'
import { MenuPage } from '../pages/MenuPage'
import { TasksPage } from '../pages/TasksPage'

const tabs = [
  { to: '/focus', label: 'Focus', icon: Target },
  { to: '/tasks', label: 'Tasks', icon: ClipboardList },
  { to: '/dates', label: 'Dates', icon: Heart },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/menu', label: 'Menu', icon: Menu },
]

export function AppShell({ pageProps }) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      {pageProps.error ? (
        <section className="mb-4 rounded-4xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Firebase sync issue: {pageProps.error}
        </section>
      ) : null}

      <Routes>
        <Route path="/" element={<Navigate to="/focus" replace />} />
        <Route path="/focus" element={<FocusPage {...pageProps} />} />
        <Route path="/tasks" element={<TasksPage {...pageProps} />} />
        <Route path="/dates" element={<DateNightPage {...pageProps} />} />
        <Route path="/plan" element={<Navigate to="/dates" replace />} />
        <Route path="/activity" element={<ActivityPage {...pageProps} />} />
        <Route path="/menu" element={<MenuPage {...pageProps} />} />
        <Route path="*" element={<Navigate to="/focus" replace />} />
      </Routes>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-panel/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-card backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `rounded-3xl px-2 py-2 text-center text-[0.7rem] font-semibold transition ${
                    isActive ? 'bg-accent text-white' : 'text-slate-500'
                  }`
                }
              >
                <span className="flex flex-col items-center gap-1">
                  <Icon size={18} />
                  {tab.label}
                </span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </main>
  )
}
