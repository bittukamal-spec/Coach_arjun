// Small pill showing one Focus Word — used for the "popular focus words"
// row on the Focus Deck screen. Display-only by default; pass onClick to
// make it tappable.
function FocusWordChip({ word, onClick }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      className={`text-sm font-semibold px-3.5 py-1.5 rounded-full border border-brand-500/30 text-brand-400 bg-brand-500/10 ${onClick ? 'active:scale-95 transition-transform' : ''}`}
    >
      {word}
    </Tag>
  );
}

export default FocusWordChip;
