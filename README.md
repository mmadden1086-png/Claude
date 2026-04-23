# Follow Through

Follow Through is a mobile-first shared execution app for Matt and Megan. It is built with React, Vite, Tailwind CSS, Firebase Auth, Firestore, Cloud Messaging, Cloud Functions, and Firebase Hosting.

## What To Do Next

1. Copy `.env.example` to `.env`.
2. Fill in the Firebase web app values plus:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_SERVICE_ACCOUNT_PATH`
   - `FIREBASE_MATT_UID`
   - `FIREBASE_MATT_EMAIL`
   - `FIREBASE_MEGAN_UID`
   - `FIREBASE_MEGAN_EMAIL`
3. Download a Firebase service account JSON into the repo root, for example `service-account.json`.
4. Run the user seed:

```bash
cmd /c npm run seed:users
```

5. Deploy everything:

```bash
cmd /c npm run deploy:firebase
```

## Local setup

```bash
cmd /c npm install
cmd /c npm --prefix functions install
cmd /c npm run dev
```

The service worker file for Firebase Messaging is generated automatically from `.env` before `dev` and `build`.

## Firebase project setup

1. Create a Firebase project.
2. Enable Email/Password Auth.
3. Create Firestore in production mode.
4. Create two auth users for Matt and Megan.
5. Copy their auth UIDs into `.env`.
6. Seed Firestore user docs with `npm run seed:users`.

An example seed payload is in `firebase-users.seed.example.json`.

## Cloud Functions

Functions live in `functions/index.js` and handle:

- push on assigned task
- point updates on completion
- repeat generation on completion
- morning digest at 7:30 AM
- evening wrap-up at 7:00 PM
- due soon sweep every 30 minutes

## Deploy options

### Full deploy

```bash
cmd /c npm run deploy:firebase
```

### Manual deploy

```bash
cmd /c npm run build
cmd /c npx firebase-tools deploy --only firestore:rules,firestore:indexes
cmd /c npx firebase-tools deploy --only functions
cmd /c npx firebase-tools deploy --only hosting
```

## Notes

- The app falls back to preview-mode mock data if Firebase env vars are missing.
- Notification permission is requested only when the user taps the notification button.
- The UI is intentionally mobile-first, fast to tap through, and focused on shared follow-through rather than full project management.
