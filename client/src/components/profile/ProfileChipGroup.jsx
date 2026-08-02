// Read-only fact chips. Not buttons: tapping one does nothing, so they are
// plain list items and are never focusable.
//
// Deliberately NOT `.tag-pill` — that class sets whitespace-nowrap, which
// clips long Hindi labels. These wrap to as many lines as they need, because
// truncating an athlete's own answer loses meaning.
//
// No colour coding, no counts, no ordering claim: a chip carries a fact, never
// a level or a rank.

export default function ProfileChipGroup({ items, ariaLabel }) {
  const chips = (items || []).filter((c) => c && c.label);
  if (!chips.length) return null;
  return (
    <ul aria-label={ariaLabel} className="flex flex-wrap gap-2 list-none p-0 m-0">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <li
            key={chip.key || chip.label}
            // .chip-fact is the Stage A read-only fact token (surface/chip +
            // hairline border). It sets size, padding and radius but NOT
            // whitespace, so long Hindi labels still wrap instead of clipping.
            className="chip-fact flex items-center gap-1.5 text-ink break-words"
          >
            {Icon && <Icon size={14} className="text-brand-500 shrink-0" aria-hidden="true" />}
            <span>{chip.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
