import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db, hasFirebaseConfig } from './firebase'
import { detectDuplicateTask } from './task-decision'

const usersCollection = db ? collection(db, 'users') : null
const tasksCollection = db ? collection(db, 'tasks') : null
const dateIdeasCollection = db ? collection(db, 'dateIdeas') : null
const dateHistoryCollection = db ? collection(db, 'dateHistory') : null

export function canUseFirebase() {
  return hasFirebaseConfig && Boolean(db)
}

export async function loginWithEmail(email, password) {
  if (!auth) throw new Error('Firebase Auth is not configured yet.')
  return signInWithEmailAndPassword(auth, email, password)
}

export async function logout() {
  if (!auth) return
  await signOut(auth)
}

export async function upsertUserProfile(profile) {
  if (!db) return
  const nextProfile = {
    updatedAt: serverTimestamp(),
  }

  for (const [key, value] of Object.entries(profile)) {
    if (key === 'pushToken' && typeof value === 'string' && !value.trim()) {
      continue
    }
    if (value !== undefined) {
      nextProfile[key] = value
    }
  }

  await setDoc(
    doc(db, 'users', profile.id),
    nextProfile,
    { merge: true },
  )
}

export async function savePushToken(userId, pushToken) {
  if (!db) return
  if (!pushToken || (typeof pushToken === 'string' && !pushToken.trim())) return
  await setDoc(doc(db, 'users', userId), {
    pushToken,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export function subscribeToUsers(onData, onError) {
  if (!usersCollection) return () => {}
  return onSnapshot(
    query(usersCollection, orderBy('name', 'asc')),
    (snapshot) => {
      onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    },
    (error) => {
      if (onError) onError(error)
    },
  )
}

export function subscribeToTasks(onData, onError) {
  if (!tasksCollection) return () => {}
  return onSnapshot(
    query(tasksCollection, orderBy('createdAt', 'desc')),
    (snapshot) => {
      onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    },
    (error) => {
      if (onError) onError(error)
    },
  )
}

export function subscribeToDateIdeas(onData, onError) {
  if (!dateIdeasCollection) return () => {}
  return onSnapshot(
    query(dateIdeasCollection, orderBy('createdAt', 'desc')),
    (snapshot) => {
      onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    },
    (error) => {
      if (onError) onError(error)
    },
  )
}

export function subscribeToDateHistory(onData, onError) {
  if (!dateHistoryCollection) return () => {}
  return onSnapshot(
    query(dateHistoryCollection, orderBy('dateCompleted', 'desc')),
    (snapshot) => {
      onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    },
    (error) => {
      if (onError) onError(error)
    },
  )
}

export async function createTask(payload) {
  if (!tasksCollection) throw new Error('Firestore is not configured yet.')
  const { clientRequestId, ...taskData } = payload

  if (clientRequestId) {
    await setDoc(
      doc(db, 'tasks', clientRequestId),
      {
        ...taskData,
        createdAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
      },
      { merge: true },
    )
    return
  }

  await addDoc(tasksCollection, {
    ...taskData,
    createdAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  })
}

export async function createTaskSafe(payload, existingTasks = []) {
  const nextPayload = {
    ...payload,
    clientRequestId: payload.clientRequestId || crypto.randomUUID(),
  }
  const duplicateTask = detectDuplicateTask(existingTasks, nextPayload)
  if (duplicateTask) {
    return {
      blocked: true,
      duplicateTask,
      payload: nextPayload,
    }
  }

  await createTask(nextPayload)
  return {
    blocked: false,
    payload: nextPayload,
  }
}

export async function updateTask(taskId, updates) {
  if (!db) throw new Error('Firestore is not configured yet.')
  await updateDoc(doc(db, 'tasks', taskId), {
    ...updates,
    lastActionAt: serverTimestamp(),
  })
}

export async function restoreTask(taskId, snapshot) {
  if (!db) throw new Error('Firestore is not configured yet.')
  await setDoc(doc(db, 'tasks', taskId), snapshot, { merge: true })
}

export async function deleteTask(taskId) {
  if (!db) throw new Error('Firestore is not configured yet.')
  await deleteDoc(doc(db, 'tasks', taskId))
}

export async function createDateIdea(payload) {
  if (!dateIdeasCollection) throw new Error('Firestore is not configured yet.')
  await addDoc(dateIdeasCollection, {
    ...payload,
    createdAt: serverTimestamp(),
  })
}

export async function updateDateIdea(ideaId, updates) {
  if (!db) throw new Error('Firestore is not configured yet.')
  await updateDoc(doc(db, 'dateIdeas', ideaId), updates)
}

export async function createDateHistory(payload) {
  if (!dateHistoryCollection) throw new Error('Firestore is not configured yet.')
  await addDoc(dateHistoryCollection, {
    ...payload,
    createdAt: serverTimestamp(),
  })
}
