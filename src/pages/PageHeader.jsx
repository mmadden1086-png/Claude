export function PageHeader({ eyebrow = 'Follow Through', title, body, meta, actions }) {
  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-panel/95 p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">{title}</h1>
          {body ? <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{body}</p> : null}
          {meta ? <p className="mt-2 text-sm font-medium text-slate-700">{meta}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}
