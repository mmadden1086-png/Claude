import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../lib/firebase'

export function useAuthSession() {
  const [sessionUser, setSessionUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(auth))

  useEffect(() => {
    if (!auth) return undefined

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setSessionUser(user)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { sessionUser, loading: auth ? loading : false, usingMockAuth: !auth }
}
