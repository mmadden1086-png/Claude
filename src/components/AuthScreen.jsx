import { useState } from 'react'
import { USERS } from '../lib/constants'
import { loginWithEmail } from '../lib/firestore'

export function AuthScreen({ usingMockAuth }) {
  const [email, setEmail] = useState(USERS[0].email)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    if (usingMockAuth) {
      setError('Firebase is not configured for this build yet.')
      return
    }

    try {
      setError('')
      await loginWithEmail(email, password)
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-4xl border border-white/60 bg-panel/95 p-6 shadow-card backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-accent">Follow Through</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">Shared execution, not a generic to-do list.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in as Matt or Megan. The app keeps tone supportive, keeps tap targets large, and syncs work through Firebase.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
            <select
              className="w-full rounded-2xl border-sand bg-white px-4 py-3"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            >
              {USERS.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
            <input
              className="w-full rounded-2xl border-sand bg-white px-4 py-3"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {usingMockAuth ? (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Firebase is unavailable for this build. Preview mode is disabled so fake data never appears.
            </p>
          ) : null}

          <button className="w-full rounded-2xl bg-accent px-4 py-4 text-base font-semibold text-white" type="submit">
            {usingMockAuth ? 'Firebase unavailable' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
