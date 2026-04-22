import { addDays, addWeeks, addMonths, parseISO, format, getDay } from 'date-fns'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const generateNextRepeatDate = (task) => {
  if (!task.repeatType || task.repeatType === 'none') return null

  const base = task.dueDate ? parseISO(task.dueDate) : new Date()

  switch (task.repeatType) {
    case 'weekly':
      return format(addWeeks(base, 1), 'yyyy-MM-dd')

    case 'biweekly':
      return format(addWeeks(base, 2), 'yyyy-MM-dd')

    case 'monthly':
      return format(addMonths(base, 1), 'yyyy-MM-dd')

    case 'specific': {
      if (!task.repeatDays?.length) return null
      const targetDays = task.repeatDays
        .map((d) => DAY_LABELS.indexOf(d))
        .filter((n) => n !== -1)
      if (!targetDays.length) return null
      let next = addDays(base, 1)
      for (let i = 0; i < 14; i++) {
        if (targetDays.includes(getDay(next))) return format(next, 'yyyy-MM-dd')
        next = addDays(next, 1)
      }
      return null
    }

    default:
      return null
  }
}

export const getRepeatLabel = (task) => {
  if (!task.repeatType || task.repeatType === 'none') return null
  switch (task.repeatType) {
    case 'weekly':
      return 'Repeats weekly'
    case 'biweekly':
      return 'Repeats every 2 weeks'
    case 'monthly':
      return 'Repeats monthly'
    case 'specific':
      if (task.repeatDays?.length) return `Repeats ${task.repeatDays.join('/')}`
      return 'Repeats on set days'
    default:
      return null
  }
}

export const suggestRepeat = (title) => {
  const l = title.toLowerCase()
  if (l.match(/\b(trash|garbage|recycling|bins?)\b/)) return 'weekly'
  if (l.match(/\b(dog food|cat food|pet food|kibble)\b/)) return 'monthly'
  return null
}

export const REPEAT_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'specific', label: 'Specific days' },
]

export const DAY_OPTIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
