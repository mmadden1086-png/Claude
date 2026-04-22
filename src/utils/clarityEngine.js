const RULES = [
  { kw: ['call', 'phone', 'reach out', 'check in with', 'ring'], hint: 'Call completed and outcome noted' },
  { kw: ['schedule', 'book appointment', 'book a', 'make an appointment'], hint: 'Appointment booked and confirmed' },
  { kw: ['pick up', 'pickup', 'grab from', 'collect'], hint: 'Item picked up and brought home' },
  { kw: ['drop off', 'dropoff', 'return to', 'bring to'], hint: 'Item dropped off or returned' },
  { kw: ['buy', 'purchase', 'order', 'get more', 'stock up'], hint: 'Item purchased' },
  { kw: ['clean', 'tidy', 'declutter', 'organize', 'sort'], hint: 'Area cleaned and reset' },
  { kw: ['pay ', 'payment', ' bill', 'invoice'], hint: 'Payment submitted and confirmed' },
  { kw: ['email ', 'send message', 'message to', 'text '], hint: 'Message sent and response handled' },
  { kw: ['research', 'look into', 'find out', 'look up', 'compare'], hint: 'Research complete and options noted' },
  { kw: ['fix', 'repair', 'replace', 'swap out'], hint: 'Issue fixed and working correctly' },
  { kw: ['register', 'sign up', 'enroll', 'apply for'], hint: 'Registration completed and confirmation saved' },
  { kw: ['renew', 'update subscription', 'extend'], hint: 'Renewal completed and confirmed' },
  { kw: ['review', 'read through', 'go over', 'check '], hint: 'Reviewed and any needed action taken' },
  { kw: ['follow up', 'follow-up', 'check back'], hint: 'Followed up and outcome noted' },
]

export const suggestClarity = (title) => {
  if (!title || title.trim().length < 3) return ''
  const lower = title.toLowerCase()
  for (const rule of RULES) {
    if (rule.kw.some((k) => lower.includes(k))) return rule.hint
  }
  return ''
}
