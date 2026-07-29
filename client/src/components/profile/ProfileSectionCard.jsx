// One card on the Performance Profile, with its uppercase micro-label heading
// and an optional supporting note. The label is a real heading so the page has
// a usable outline, and it is uppercased in CSS rather than in the string so
// screen readers announce it normally.
//
// Theme comes entirely from existing semantic tokens — one DOM structure for
// light and dark, no `dark:` prefixes (this app's dark mode has a manual
// [data-theme] override that Tailwind's media strategy would ignore).

export default function ProfileSectionCard({ id, title, note, children, className = '' }) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={`card p-4 ${className}`}
    >
      {title && (
        <h2 id={headingId} className="text-micro font-bold text-slt uppercase">
          {title}
        </h2>
      )}
      {note && <p className="text-caption text-muted mt-0.5 mb-2.5">{note}</p>}
      {!note && title && <div className="mt-2.5" />}
      {children}
    </section>
  );
}
