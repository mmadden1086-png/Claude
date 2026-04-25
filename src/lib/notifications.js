// Standalone (non-React) notification utilities.
// The React hook at src/hooks/use-notifications.js wraps these for component use.
// Call these directly from one-off scripts or non-component contexts.
//
// HTTPS required: FCM tokens are only issued on secure origins (or localhost).

import { httpsCallable } from 'firebase/functions'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getToken, onMessage } from 'firebase/messaging'
import { db, functions, getMessagingIfSupported } from './firebase'

async function getSwRegistration() {
  const existing =
    (await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')) ??
    (await navigator.serviceWorker.getRegistration())
  const registration = existing ?? (await navigator.serviceWorker.register('/firebase-messaging-sw.js'))
  await registration.update().catch(() => {})
  await navigator.serviceWorker.ready
  return registration
}

// Request notification permission and return an FCM token, or null if unavailable.
// Safe to call repeatedly — skips the permission prompt if already granted or denied.
export async function enableNotifications() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return null
  }

  if (!window.isSecureContext) {
    console.warn('[notifications] FCM requires HTTPS (or localhost).')
    return null
  }

  if (Notification.permission === 'denied') return null

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.info('[notifications] Permission not granted:', permission)
      return null
    }
  }

  const messaging = await getMessagingIfSupported()
  if (!messaging) return null

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    console.error('[notifications] VITE_FIREBASE_VAPID_KEY is not set.')
    return null
  }

  try {
    const swRegistration = await getSwRegistration()
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration })
    return token || null
  } catch (error) {
    console.error('[notifications] Failed to get FCM token:', error)
    return null
  }
}

// Persist an FCM token for a user.
// Prefers the registerPushToken Cloud Function (sends a confirmation notification).
// Falls back to a direct Firestore write if Functions are unavailable.
export async function saveToken(userId, token) {
  if (!userId || !token) return

  if (functions) {
    try {
      const register = httpsCallable(functions, 'registerPushToken')
      await register({ token })
      return
    } catch (error) {
      console.error('[notifications] registerPushToken callable failed:', error)
    }
  }

  // Direct write fallback (no confirmation notification)
  if (!db) return
  try {
    await setDoc(
      doc(db, 'users', userId),
      { pushToken: token, updatedAt: serverTimestamp() },
      { merge: true },
    )
  } catch (error) {
    console.error('[notifications] Failed to save push token to Firestore:', error)
  }
}

// Attach a foreground message listener. Returns an unsubscribe function.
// While the app is in the foreground, FCM suppresses native notifications;
// this lets you show an in-app toast instead.
export async function listenForNotifications(onNotification) {
  if (typeof window === 'undefined') return () => {}
  if (Notification.permission !== 'granted') return () => {}

  const messaging = await getMessagingIfSupported()
  if (!messaging) return () => {}

  const unsubscribe = onMessage(messaging, (payload) => {
    console.info('[notifications] Foreground message received:', payload)
    onNotification?.({
      title: payload.notification?.title ?? 'Follow Through',
      body: payload.notification?.body ?? '',
      data: payload.data ?? {},
    })
  })

  return unsubscribe
}
