import { getToken, onMessage } from 'firebase/messaging'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import { functions, getMessagingIfSupported } from '../lib/firebase'
import { savePushToken } from '../lib/firestore'

const NOTIFICATIONS_STORAGE_KEY = 'notificationsEnabled'
const NOTIFICATIONS_TOKEN_STORAGE_KEY = 'follow-through-notification-token'

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = window.atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function hasValidVapidKey() {
  const key = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!key || typeof key !== 'string') return false

  try {
    const bytes = decodeBase64Url(key)
    return bytes.length === 65 && bytes[0] === 4
  } catch {
    return false
  }
}

function detectNotificationEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ok: false, status: 'unsupported', message: 'Notifications are not supported here.' }
  }

  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, status: 'unsupported', message: 'This browser does not support push notifications.' }
  }

  if (!window.isSecureContext) {
    return { ok: false, status: 'unsupported', message: 'Notifications require a secure connection.' }
  }

  if (!hasValidVapidKey()) {
    return {
      ok: false,
      status: 'config-error',
      message: 'Firebase web push key is invalid and needs to be replaced in app config.',
    }
  }

  const userAgent = navigator.userAgent || ''
  const isIosDevice = /iPad|iPhone|iPod/i.test(userAgent)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

  if (isIosDevice && !isStandalone) {
    return {
      ok: false,
      status: 'install-required',
      message: 'On iPhone or iPad, install Follow Through to your Home Screen first.',
    }
  }

  return { ok: true }
}

async function ensureMessagingServiceWorker() {
  const existingRegistration =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ??
    (await navigator.serviceWorker.getRegistration())

  const registration =
    existingRegistration ??
    (await navigator.serviceWorker.register('/firebase-messaging-sw.js'))

  await registration.update().catch(() => {})
  await navigator.serviceWorker.ready
  return registration
}

function mapNotificationError(error) {
  const code = typeof error?.code === 'string' ? error.code : String(error?.code ?? '')
  const message = typeof error?.message === 'string' ? error.message : String(error?.message ?? '')

  if (code.includes('permission-blocked') || Notification.permission === 'denied') {
    return { status: 'blocked', message: 'Notifications were blocked in this browser.' }
  }

  if (code.includes('unsupported-browser')) {
    return { status: 'unsupported', message: 'This browser does not support push notifications.' }
  }

  if (code.includes('failed-service-worker-registration')) {
    return { status: 'service-worker', message: 'The notification service worker could not start.' }
  }

  if (message) {
    return { status: 'error', message: `Notifications could not be enabled: ${message}` }
  }

  return { status: 'error', message: 'Could not enable notifications.' }
}

async function registerPushTokenOnServer(userId, token) {
  // Save directly to Firestore first — most reliable path, no extra round-trip.
  await savePushToken(userId, token)

  // Also call the Cloud Function so it can send the confirmation notification.
  // Best-effort: token is already saved above, so a CF failure is not fatal.
  if (functions) {
    try {
      await httpsCallable(functions, 'registerPushToken')({ token })
    } catch (error) {
      console.warn('registerPushToken CF call failed (token already saved directly):', error)
    }
  }
}

async function sendDirectTestNotification(token) {
  if (!functions || !token) return
  const sendNotification = httpsCallable(functions, 'sendNotification')
  await sendNotification({
    token,
    title: 'Follow Through test',
    body: 'Notifications are connected and ready.',
    data: { kind: 'test' },
  })
}

export function useNotifications(userId) {
  const [status, setStatus] = useState(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'idle'
    return Notification.permission === 'granted' && window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === 'true' ? 'enabled' : 'idle'
  })

  useEffect(() => {
    let cancelled = false

    async function syncExistingRegistration() {
      if (!userId) return
      const environment = detectNotificationEnvironment()
      if (!environment.ok) {
        if (!cancelled) setStatus(environment.status === 'install-required' ? 'idle' : environment.status)
        return
      }

      if (Notification.permission !== 'granted') {
        window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
        window.localStorage.removeItem(NOTIFICATIONS_TOKEN_STORAGE_KEY)
        if (!cancelled) setStatus('idle')
        return
      }

      try {
        const messaging = await getMessagingIfSupported()
        if (!messaging) {
          window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
          if (!cancelled) setStatus('unsupported')
          return
        }

        const serviceWorkerRegistration = await ensureMessagingServiceWorker()
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration,
        })

        if (!token) {
          window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
          if (!cancelled) setStatus('idle')
          return
        }

        await registerPushTokenOnServer(token)
        window.localStorage.setItem(NOTIFICATIONS_TOKEN_STORAGE_KEY, token)
        window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, 'true')
        if (!cancelled) setStatus('enabled')
      } catch (error) {
        console.error('Notification sync failed', error)
        window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
        window.localStorage.removeItem(NOTIFICATIONS_TOKEN_STORAGE_KEY)
        if (!cancelled) setStatus('idle')
      }
    }

    void syncExistingRegistration()

    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    let unsubscribe = null

    async function attachForegroundListener() {
      if (!userId) return
      if (typeof window === 'undefined' || typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return

      const messaging = await getMessagingIfSupported()
      if (!messaging) return

      unsubscribe = onMessage(messaging, async (payload) => {
        const title = payload.notification?.title ?? 'Follow Through'
        const body = payload.notification?.body ?? 'A task needs attention.'
        try {
          const registration = await navigator.serviceWorker.ready
          registration.showNotification(title, { body, icon: '/favicon.svg' })
        } catch {
          new Notification(title, { body })
        }
      })
    }

    void attachForegroundListener()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [userId])

  async function enableNotifications() {
    if (!userId) {
      setStatus('unsupported')
      return { status: 'unsupported', message: 'Notifications are not supported here.' }
    }

    const environment = detectNotificationEnvironment()
    if (!environment.ok) {
      window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
      window.localStorage.removeItem(NOTIFICATIONS_TOKEN_STORAGE_KEY)
      setStatus(environment.status)
      return { status: environment.status, message: environment.message }
    }

    setStatus('working')

    try {
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
        window.localStorage.removeItem(NOTIFICATIONS_TOKEN_STORAGE_KEY)
        setStatus('blocked')
        return { status: 'blocked', message: 'Notifications were blocked in this browser.' }
      }

      const messaging = await getMessagingIfSupported()
      if (!messaging) {
        window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
        window.localStorage.removeItem(NOTIFICATIONS_TOKEN_STORAGE_KEY)
        setStatus('unsupported')
        return { status: 'unsupported', message: 'This browser does not support push notifications.' }
      }

      const serviceWorkerRegistration = await ensureMessagingServiceWorker()
      let token = null
      try {
        token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration,
        })
      } catch (swTokenError) {
        console.warn('getToken with explicit SW failed, retrying without SW hint:', swTokenError)
        token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY })
      }

      if (!token) {
        throw new Error('FCM did not return a push token. Check that Cloud Messaging is enabled in the Firebase Console.')
      }

      await registerPushTokenOnServer(userId, token)
      window.localStorage.setItem(NOTIFICATIONS_TOKEN_STORAGE_KEY, token)
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, 'true')

      try {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification('Follow Through notifications enabled', {
          body: 'You will get a heads-up when something needs attention.',
          icon: '/favicon.svg',
        })
      } catch {
        // ignore — FCM test notification from registerPushToken will still arrive
      }

      try {
        await sendDirectTestNotification(token)
      } catch (error) {
        console.warn('Direct test notification failed after registration.', error)
      }

      setStatus('enabled')
      return { status: 'enabled', message: 'Notifications repaired and test sent.' }
    } catch (error) {
      console.error('Notification enable failed', error)
      window.localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY)
      window.localStorage.removeItem(NOTIFICATIONS_TOKEN_STORAGE_KEY)
      const mapped = mapNotificationError(error)
      setStatus(mapped.status)
      return mapped
    }
  }

  return { notificationStatus: status, enableNotifications }
}
