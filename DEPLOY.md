# Follow Through — Deployment Guide

## Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project with Blaze (pay-as-you-go) plan (required for Cloud Functions)

---

## 1. Create Your Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `follow-through`)
3. Enable **Google Analytics** (optional)

---

## 2. Enable Firebase Services

In the Firebase Console, enable:

- **Authentication** → Sign-in method → Email/Password → Enable
- **Firestore Database** → Create database → Start in **production mode** → Choose region
- **Cloud Messaging** → No action needed (enabled by default)
- **Hosting** → Get started (follow setup)
- **Functions** → Upgrade to Blaze plan when prompted

---

## 3. Create User Accounts

In **Authentication → Users → Add user**:
- Matt: `matt@yourdomain.com` / set a password
- Megan: `megan@yourdomain.com` / set a password

Then in **Firestore → users collection**, create two documents (use the UID shown in Auth):

```
users/{matt-uid}:
  id: "{matt-uid}"
  name: "Matt"
  email: "matt@yourdomain.com"
  pushToken: ""
  totalPoints: 0
  weeklyPoints: 0

users/{megan-uid}:
  id: "{megan-uid}"
  name: "Megan"
  email: "megan@yourdomain.com"
  pushToken: ""
  totalPoints: 0
  weeklyPoints: 0
```

---

## 4. Get Your Config Values

### Web App Config

Firebase Console → Project Settings (gear icon) → **Your apps** → Add app → Web

Copy the `firebaseConfig` object. Replace placeholders in:
- `src/lib/firebase.js`
- `public/firebase-messaging-sw.js`

### VAPID Key

Firebase Console → Project Settings → **Cloud Messaging** → **Web configuration** → Generate key pair

Copy the key into `src/lib/firebase.js` as `VAPID_KEY`.

---

## 5. Update Placeholders

Replace all `YOUR_*` values:

| File | Placeholder | Value |
|------|-------------|-------|
| `src/lib/firebase.js` | `YOUR_API_KEY` etc. | Firebase web config |
| `src/lib/firebase.js` | `YOUR_VAPID_KEY` | FCM VAPID key |
| `public/firebase-messaging-sw.js` | Same config fields | Same values |
| `.firebaserc` | `YOUR_PROJECT_ID` | Your project ID |

---

## 6. Deploy Firestore Rules & Indexes

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 7. Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Functions deployed:
- `onTaskCreated` — push notification when task is assigned
- `onTaskUpdated` — push when task is reassigned
- `morningDigest` — 7:30 AM daily digest
- `eveningWrapUp` — 7:00 PM wrap-up reminder
- `dueSoonCheck` — every 30 minutes, due-soon alerts
- `resetWeeklyPoints` — Sunday midnight point reset

> **Timezone note**: Functions use `America/Chicago`. Change in `functions/index.js` if needed.

---

## 8. Build & Deploy the Web App

```bash
# From the project root:
npm install
npm run build
firebase deploy --only hosting
```

Your app will be live at:
`https://YOUR_PROJECT_ID.web.app`

---

## 9. Add App Icons

Place these in `/public/`:
- `icon-192.png` — 192×192 app icon
- `icon-512.png` — 512×512 app icon
- `favicon.ico` — browser favicon

Any square PNG works. Keep them simple and dark-background friendly.

---

## 10. Add as Home Screen App (PWA)

On Android Chrome:
- Open the app → tap ⋮ → **Add to Home screen**

On iOS Safari:
- Open the app → tap Share → **Add to Home Screen**

---

## Local Development

```bash
# Start Vite dev server
npm run dev

# Start Firebase emulators (separate terminal)
firebase emulators:start
```

Update `src/lib/firebase.js` to connect to emulators during dev:

```js
import { connectFirestoreEmulator } from 'firebase/firestore'
import { connectAuthEmulator } from 'firebase/auth'

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
}
```

---

## Updating Timezone

All scheduled functions default to `America/Chicago`.
To change, find every `timeZone:` in `functions/index.js` and update.

---

## Security Notes

- Firestore rules allow both authenticated users to read/write all tasks — appropriate for a private two-person app
- Only the task creator's UID is stored as `requestedBy` — enforced by Firestore rules on create
- Push tokens are stored per-user and only used server-side in Cloud Functions
- Never commit your Firebase config to a public repo; use environment variables for production CI/CD
