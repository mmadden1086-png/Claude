import { createContext, useContext, useEffect, useState } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getAllUsers, subscribeToUserProfile } from '../lib/firestore'

const AuthContext = createContext(null)

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [partnerProfile, setPartnerProfile] = useState(null)
  const [partnerId, setPartnerId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Auth state listener — discover partner UID once on login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (!user) {
        setUserProfile(null)
        setPartnerProfile(null)
        setPartnerId(null)
        setLoading(false)
        return
      }
      try {
        const allUsers = await getAllUsers()
        const partner = allUsers.find((u) => u.id !== user.uid)
        setPartnerId(partner?.id || null)
      } catch {
        // best-effort
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Real-time own profile
  useEffect(() => {
    if (!currentUser) return
    return subscribeToUserProfile(currentUser.uid, setUserProfile)
  }, [currentUser])

  // Real-time partner profile
  useEffect(() => {
    if (!partnerId) return
    return subscribeToUserProfile(partnerId, setPartnerProfile)
  }, [partnerId])

  const login = async (email, password) => {
    setAuthError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const msg =
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'Incorrect email or password.'
          : err.code === 'auth/user-not-found'
          ? 'No account found for that email.'
          : 'Login failed. Try again.'
      setAuthError(msg)
      throw err
    }
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        partnerProfile,
        loading,
        authError,
        setAuthError,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
