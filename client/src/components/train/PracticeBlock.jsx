// Train practice tile (Playbook redesign): one flat colour block per
// practice — the drawing, then the practice name directly under it. The
// whole block is the single control and its name is its accessible name.
//
// Founder decisions (Nov 2026): every title is the same dark ink (so the
// Ritual block is a light blue, not the strong brand blue), there is no
// description line, and titles sit at the same height across a row because
// they follow the drawing rather than being pushed to the bottom.
//
// The drawing scales with the screen height (clamp on dvh), so the four
// tiles and the "My practice" row fit above the nav bar on an ordinary
// phone instead of running under it.
const TONES = {
  sky:   'bg-sky',
  mint:  'bg-mint',
  sun:   'bg-sun',
  coral: 'bg-coral',
};

function PracticeBlock({ tone = 'sky', title, Art, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[26px] p-4 flex flex-col items-start gap-3 text-left text-inkblock active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${TONES[tone] || TONES.sky}`}
    >
      {Art && <Art className="h-[clamp(64px,11dvh,104px)] w-auto shrink-0" />}
      <span className="block text-[19px] leading-tight font-extrabold [text-wrap:balance]">{title}</span>
    </button>
  );
}

export default PracticeBlock;
