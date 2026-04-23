import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const root = process.cwd()
const envPath = path.join(root, '.env')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const raw = fs.readFileSync(filePath, 'utf8')
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      }),
  )
}

const env = { ...parseEnvFile(envPath), ...process.env }
const serviceAccountPath = env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(root, env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : null

if (!serviceAccountPath || !fs.existsSync(serviceAccountPath)) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH in .env to a downloaded service account json file.')
}

const required = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_MATT_UID',
  'FIREBASE_MATT_EMAIL',
  'FIREBASE_MEGAN_UID',
  'FIREBASE_MEGAN_EMAIL',
]

for (const key of required) {
  if (!env[key]) throw new Error(`Missing ${key} in .env`)
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: env.FIREBASE_PROJECT_ID,
})

const db = admin.firestore()

const users = [
  {
    id: env.FIREBASE_MATT_UID,
    name: 'Matt',
    email: env.FIREBASE_MATT_EMAIL,
    pushToken: '',
    totalPoints: 0,
    weeklyPoints: 0,
  },
  {
    id: env.FIREBASE_MEGAN_UID,
    name: 'Megan',
    email: env.FIREBASE_MEGAN_EMAIL,
    pushToken: '',
    totalPoints: 0,
    weeklyPoints: 0,
  },
]

for (const user of users) {
  await db.collection('users').doc(user.id).set(user, { merge: true })
  console.log(`Seeded users/${user.id}`)
}

console.log('User seed complete.')
