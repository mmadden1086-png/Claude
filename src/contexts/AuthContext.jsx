import { createContext, useContext, useEffect, useState } from 'react'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import {
  createOrUpdateUserProfile,
  getAllUsers,
  subscribeToUserProfile,
} from '../lib/firestore'

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
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (!user) {
        setUserProfile(null)
        setPartnerProfile(null)
        setLoading(false)
        return
      }

      // Fetch all user profiles to identify partner
      try {
        const allUsers = await getAllUsers()
        const partner = allUsers.find((u) => u.id !== user.uid)
        setPartnerProfile(partner || null)
      } catch {
        // partner discovery is best-effort
      }

      setLoading(false)
    })
    return unsub
  }, [])

  // Real-time own profile listener
  useEffect(() => {
    if (!currentUser) return
    const unsub = subscribeToUserProfile(currentUser.uid, setUserProfile)
    return unsub
  }, [currentUser])

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
