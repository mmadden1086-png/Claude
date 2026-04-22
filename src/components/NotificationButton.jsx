import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { requestAndSavePushToken } from '../lib/messaging'

const NotificationButton = () => {
  const { currentUser } = useAuth()
  const [state, setState] = useState('idle') // idle | requesting | granted | denied

  if (!('Notification' in window)) return null
  if (Notification.permission === 'granted' && state === 'idle') return null

  const handleRequest = async () => {
    setState('requesting')
    const token = await requestAndSavePushToken(currentUser?.uid)
    setState(token ? 'granted' : 'denied')
  }

  if (state === 'granted') {
    return (
      <p className="text-xs text-emerald-400 text-center py-2">
        Notifications enabled
      </p>
    )
  }

  return (
    <button
      onClick={handleRequest}
      disabled={state === 'requesting'}
      className="w-full py-3 bg-slate-700/60 rounded-2xl text-sm text-slate-300 min-h-[48px] active:bg-slate-700 disabled:opacity-50"
    >
      {state === 'requesting'
        ? 'Enabling…'
        : state === 'denied'
        ? 'Notifications blocked — update in browser settings'
        : 'Enable push notifications'}
    </button>
  )
}

export default NotificationButton
