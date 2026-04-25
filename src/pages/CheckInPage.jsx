import { buildWeeklyCheckInReview, getWeeklyCheckInOpening } from '../lib/check-in-review'

export default function CheckInPage({ tasks, currentUser, partner }) {
  const review = buildWeeklyCheckInReview({
    tasks,
    currentUserId: currentUser?.id,
    partnerId: partner?.id,
  })

  const opening = getWeeklyCheckInOpening(review)

  return (
    <div className="p-4 space-y-6">
      <div className="text-lg font-semibold">
        {opening}
      </div>

      {review.partnerCarrying.length > 0 && (
        <section>
          <div className="text-sm font-medium mb-2">
            These are waiting on you
          </div>
          {review.partnerCarrying.map(task => (
            <div key={task.id} className="py-2 border-b">
              <div className="text-sm">{task.title}</div>
              <div className="text-xs text-slate-500">{task.reason}</div>
            </div>
          ))}
        </section>
      )}

      {review.needsDecision.length > 0 && (
        <section>
          <div className="text-sm font-medium mb-2">
            These need a decision
          </div>
          {review.needsDecision.map(task => (
            <div key={task.id} className="py-2 border-b">
              <div className="text-sm">{task.title}</div>
              <div className="text-xs text-slate-500">{task.reason}</div>
            </div>
          ))}
        </section>
      )}

      {review.didNotMove.length > 0 && (
        <section>
          <div className="text-sm font-medium mb-2">
            These haven’t moved
          </div>
          {review.didNotMove.map(task => (
            <div key={task.id} className="py-2 border-b">
              <div className="text-sm">{task.title}</div>
              <div className="text-xs text-slate-500">{task.reason}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
