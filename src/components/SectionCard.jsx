export function SectionCard({ title, subtitle, children, action }) {
  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-panel/95 p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm leading-5 text-slate-600">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}
