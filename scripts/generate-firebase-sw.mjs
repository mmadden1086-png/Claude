import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const envPath = path.join(root, '.env')
const templatePath = path.join(root, 'public', 'firebase-messaging-sw.template.js')
const outputPath = path.join(root, 'public', 'firebase-messaging-sw.js')

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
        const key = line.slice(0, index).trim()
        const value = line.slice(index + 1).trim()
        return [key, value]
      }),
  )
}

const env = { ...parseEnvFile(envPath), ...process.env }
const template = fs.readFileSync(templatePath, 'utf8')

const replacements = {
  __VITE_FIREBASE_API_KEY__: env.VITE_FIREBASE_API_KEY || 'REPLACE_AT_DEPLOY',
  __VITE_FIREBASE_AUTH_DOMAIN__: env.VITE_FIREBASE_AUTH_DOMAIN || 'REPLACE_AT_DEPLOY',
  __VITE_FIREBASE_PROJECT_ID__: env.VITE_FIREBASE_PROJECT_ID || 'REPLACE_AT_DEPLOY',
  __VITE_FIREBASE_STORAGE_BUCKET__: env.VITE_FIREBASE_STORAGE_BUCKET || 'REPLACE_AT_DEPLOY',
  __VITE_FIREBASE_MESSAGING_SENDER_ID__: env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'REPLACE_AT_DEPLOY',
  __VITE_FIREBASE_APP_ID__: env.VITE_FIREBASE_APP_ID || 'REPLACE_AT_DEPLOY',
}

const output = Object.entries(replacements).reduce(
  (current, [token, value]) => current.replaceAll(token, value),
  template,
)

fs.writeFileSync(outputPath, output)
console.log(`firebase-messaging-sw.js updated at ${outputPath}`)
