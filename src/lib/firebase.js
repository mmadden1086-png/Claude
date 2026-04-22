import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getMessaging, isSupported } from 'firebase/messaging'

// ─── Replace these placeholders with your Firebase project config ───────────
// Firebase Console → Project Settings → Your apps → Web app → Config
const firebaseConfig = {
  apiKey: 'AIzaSyAhgGIhmiJYS5ZxA4N0HETLBa9W3EcWErI',
  authDomain: 'follow-through-87d50.firebaseapp.com',
  projectId: 'follow-through-87d50',
  storageBucket: 'follow-through-87d50.firebasestorage.app',
  messagingSenderId: '153740630717',
  appId: '1:153740630717:web:46e7580b3c75564c74b5d4',
}

// VAPID key from Firebase Console → Cloud Messaging → Web configuration
export const VAPID_KEY = 'BL-m8BNALLZqiuaRUXPKDQ-l7AC58Wsz7JvzgPdYz8Y82jy-aRYSjIf5WzxmSb7KqAPxlGPQNSUuOWCIdVYkezg'

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

let _messaging = null
export const getMessagingInstance = async () => {
  if (_messaging) return _messaging
  try {
    const supported = await isSupported()
    if (!supported) return null
    _messaging = getMessaging(app)
    return _messaging
  } catch {
    return null
  }
}

export default app
