// Train practice tile (Playbook redesign): one flat colour block per
// practice, with its drawing on top and the name + one line below. The whole
// block is the single control — its title and description are its accessible
// name. Block colours are identical in light and dark.
//
// `tone` picks the block; text colour follows it (white on blue, dark ink on
// the light blocks) and the description colour is a darker shade of the same
// hue so the small line stays readable.
const TONES = {
  blue:  { block: 'bg-brand-500 text-white',  desc: 'text-white/90' },
  mint:  { block: 'bg-mint text-inkblock',    desc: 'text-[#1C3B33]' },
  sun:   { block: 'bg-sun text-inkblock',     desc: 'text-[#3A3206]' },
  coral: { block: 'bg-coral text-inkblock',   desc: 'text-[#3B1108]' },
};

function PracticeBlock({ tone = 'blue', title, desc, Art, onClick }) {
  const { block, desc: descClass } = TONES[tone] || TONES.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-[214px] rounded-[26px] p-4 flex flex-col justify-between text-left active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${block}`}
    >
      {Art && <Art />}
      <span className="block mt-3">
        <span className="block text-[19px] leading-tight font-extrabold [text-wrap:pretty]">{title}</span>
        <span className={`block mt-1 text-[12.5px] leading-snug [text-wrap:pretty] ${descClass}`}>{desc}</span>
      </span>
    </button>
  );
}

export default PracticeBlock;
