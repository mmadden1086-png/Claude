import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDoc,
  setDoc,
  getDocs,
  where,
  Timestamp,
  increment,
} from 'firebase/firestore'
import { db } from './firebase'

// ─── Users ──────────────────────────────────────────────────────────────────

export const createOrUpdateUserProfile = async (uid, data) => {
  const ref = doc(db, 'users', uid)
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
}

export const getUserProfile = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const subscribeToUserProfile = (uid, callback) =>
  onSnapshot(doc(db, 'users', uid), (snap) =>
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  )

export const getAllUsers = async () => {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const updateUserPoints = async (uid, weeklyDelta, totalDelta) => {
  await updateDoc(doc(db, 'users', uid), {
    weeklyPoints: increment(weeklyDelta),
    totalPoints: increment(totalDelta),
  })
}

export const savePushToken = async (uid, token) => {
  await updateDoc(doc(db, 'users', uid), { pushToken: token })
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

const toDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (v?.toDate) return v.toDate()
  return new Date(v)
}

const normalizeTask = (d) => ({
  id: d.id,
  ...d.data(),
  createdAt: toDate(d.data().createdAt),
  completedAt: toDate(d.data().completedAt),
  snoozedUntil: toDate(d.data().snoozedUntil),
  acknowledgedAt: toDate(d.data().acknowledgedAt),
  lastActionAt: toDate(d.data().lastActionAt),
})

export const subscribeToTasks = (callback) => {
  const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => callback(snap.docs.map(normalizeTask)))
}

export const addTask = async (taskData) => {
  const ref = await addDoc(collection(db, 'tasks'), {
    title: '',
    notes: '',
    assignedTo: '',
    requestedBy: '',
    dueDate: null,
    dueTime: null,
    urgency: 'medium',
    effort: 'Medium',
    category: '',
    clarity: '',
    whyThisMatters: '',
    repeatType: 'none',
    repeatDays: [],
    isCompleted: false,
    isMissed: false,
    completedAt: null,
    snoozedUntil: null,
    acknowledgedAt: null,
    lastActionAt: serverTimestamp(),
    ...taskData,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export const updateTask = async (taskId, updates) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    ...updates,
    lastActionAt: serverTimestamp(),
  })
}

export const completeTask = async (taskId) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    isCompleted: true,
    completedAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  })
}

export const uncompleteTask = async (taskId) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    isCompleted: false,
    completedAt: null,
    lastActionAt: serverTimestamp(),
  })
}

export const snoozeTask = async (taskId, until) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    snoozedUntil: Timestamp.fromDate(until),
    lastActionAt: serverTimestamp(),
  })
}

export const unsnoozeTask = async (taskId) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    snoozedUntil: null,
    lastActionAt: serverTimestamp(),
  })
}

export const acknowledgeTask = async (taskId) => {
  await updateDoc(doc(db, 'tasks', taskId), {
    acknowledgedAt: serverTimestamp(),
    lastActionAt: serverTimestamp(),
  })
}

export const deleteTask = async (taskId) => {
  await deleteDoc(doc(db, 'tasks', taskId))
}

export const getTask = async (taskId) => {
  const snap = await getDoc(doc(db, 'tasks', taskId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export const repeatTaskExists = async (title, assignedTo, afterDate) => {
  const q = query(
    collection(db, 'tasks'),
    where('title', '==', title),
    where('assignedTo', '==', assignedTo),
    where('isCompleted', '==', false),
    where('dueDate', '>=', afterDate)
  )
  const snap = await getDocs(q)
  return !snap.empty
}
