// "Example" card (founder, Nov 2026): every tool shows a filled-in example,
// so someone new to mental training can see what they will get before they
// start. Static demo content — never the athlete's data.
export default function ExampleCard({ example, className = '' }) {
  if (!example) return null;
  return (
    <section className={`rounded-[22px] bg-dark-400 p-4 text-left ${className}`} aria-label={example.label} data-testid="example-card">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slt">{example.label}</p>
      {example.title && <p className="mt-1 text-[16px] font-extrabold text-ink">{example.title}</p>}
      {example.flow && (
        <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
          {example.flow.map((step, i) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="rounded-full bg-dark-900 px-2.5 py-1">{step}</span>
              {i < example.flow.length - 1 && <span aria-hidden="true">→</span>}
            </li>
          ))}
        </ol>
      )}
      {example.rows && <dl className="mt-2 flex flex-col gap-1.5">
        {example.rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[12px] font-bold text-slt">{k}</dt>
            <dd className="text-[14px] font-semibold leading-snug text-ink">{v}</dd>
          </div>
        ))}
      </dl>}
    </section>
  );
}
