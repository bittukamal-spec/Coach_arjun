// Hub card for one game on the Mental Reps page.
function GameCard({ icon, title, purpose, skillTag, playsToday, limit, onPlay }) {
  const atLimit = playsToday >= limit;
  return (
    <div className="bg-dark-400 border border-dark-600 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{icon}</span>
          <h2 className="text-base font-bold text-ink">{title}</h2>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ backgroundColor: 'rgba(24,95,165,0.10)', color: '#185FA5' }}
        >
          {skillTag}
        </span>
      </div>

      <p className="text-sm text-slt leading-relaxed">{purpose}</p>

      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted font-medium">{playsToday}/{limit} plays today</span>
        {atLimit ? (
          <span className="text-xs text-slt font-medium px-4 py-3">Come back tomorrow</span>
        ) : (
          <button
            onClick={onPlay}
            className="text-white text-sm font-semibold px-8 rounded-xl active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#185FA5', minHeight: '56px' }}
          >
            Play
          </button>
        )}
      </div>
    </div>
  );
}

export default GameCard;
