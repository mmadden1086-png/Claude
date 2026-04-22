import { getToken, onMessage } from 'firebase/messaging'
import { getMessagingInstance, VAPID_KEY } from './firebase'
import { savePushToken } from './firestore'

export const requestAndSavePushToken = async (uid) => {
  try {
    if (!('Notification' in window)) return null
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const messaging = await getMessagingInstance()
    if (!messaging) return null

    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    if (token && uid) await savePushToken(uid, token)
    return token
  } catch (err) {
    console.error('FCM token error:', err)
    return null
  }
}

export const subscribeForegroundMessages = async (callback) => {
  const messaging = await getMessagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}
