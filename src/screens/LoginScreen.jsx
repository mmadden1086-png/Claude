import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const LoginScreen = () => {
  const { login, authError, setAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch {
      // error set in context
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-white tracking-tight">Follow Through</h1>
          <p className="text-slate-400 text-sm mt-1">Shared execution, together</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setAuthError(null)
              }}
              placeholder="Email"
              autoComplete="email"
              className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-2xl px-4 py-4 text-[15px] outline-none min-h-[56px] border border-transparent focus:border-slate-600"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setAuthError(null)
              }}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full bg-slate-800 text-white placeholder-slate-500 rounded-2xl px-4 py-4 text-[15px] outline-none min-h-[56px] border border-transparent focus:border-slate-600"
            />
          </div>

          {authError && (
            <p className="text-red-400 text-sm text-center px-2">{authError}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-4 bg-blue-600 rounded-2xl text-white font-semibold text-[15px] min-h-[56px] disabled:opacity-40 active:bg-blue-700"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs mt-8">
          Follow Through · Private app for Matt &amp; Megan
        </p>
      </div>
    </div>
  )
}

export default LoginScreen
