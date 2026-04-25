export function FocusInsightBanner({ insight }) {
  if (!insight?.body) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Worth noticing
      </p>
      <p className="mt-1 text-sm font-medium leading-5 text-slate-900">
        {insight.body}
      </p>
    </section>
  )
}
