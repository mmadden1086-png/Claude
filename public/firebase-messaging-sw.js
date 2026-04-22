// Firebase Cloud Messaging Service Worker
// This file must be at the root of your domain (/firebase-messaging-sw.js)

// ─── Replace with your Firebase config values ────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
}

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js')

firebase.initializeApp(FIREBASE_CONFIG)

const messaging = firebase.messaging()

// Handle background push messages
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {}

  self.registration.showNotification(title || 'Follow Through', {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    tag: 'follow-through',
    renotify: true,
  })
})

// Handle notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.link || '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if available
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open new window
        if (clients.openWindow) return clients.openWindow(url)
      })
  )
})
