const QUESTIONS = [
  "What's one thing I did this week that made your life easier?",
  "What's something you're carrying right now that I might not know about?",
  "What would make next week feel more manageable for you?",
  "What's one small thing I could do differently that would mean a lot?",
  "When did you feel most supported by me recently?",
  "What's a decision we keep avoiding that we should just make?",
  "What do you wish we talked about more?",
  "What's something you're proud of this week, big or small?",
  "What does a good weekend look like for you right now?",
  "Is there anything you need from me that you haven't asked for?",
  "What's one thing about our home life that's working really well?",
  "What's draining your energy most right now?",
  "What's something you appreciate about how we share responsibilities?",
  "What's one thing you've been putting off that I could help with?",
  "What does feeling connected to me look like for you this week?",
  "What's something we used to do together that you miss?",
  "What's one thing you wish we planned better as a team?",
  "What's a small win we should celebrate together?",
  "What's making you feel stressed that we haven't talked about?",
  "What's one way I show up for you that you really value?",
  "What's something you've been needing more of from our relationship?",
  "What's one thing you're looking forward to in the next month?",
  "What's a habit we've built together that you're glad we have?",
  "What's something you feel like you're handling alone that we could share?",
  "What does a really good day together look like for you?",
  "What's one thing that would help you feel less overwhelmed this week?",
  "Is there something I said recently that stuck with you, good or bad?",
  "What's one thing we disagree on that we've never fully worked through?",
  "What feels unfair about how we divide things right now?",
  "What's something you want us to try together that we haven't yet?",
]

export function getTodayQuestion() {
  const now = new Date()
  const dayOfYear = Math.floor(
    (now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24),
  )
  return QUESTIONS[dayOfYear % QUESTIONS.length]
}

export function getTodayDateKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
