import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';

// Hub card for one game on the Mental Reps page. `moment` is an optional
// small eyebrow label for when to use it (e.g. "Before you play") — kept
// separate from `skillTag` (the skill it trains) so the two never collide.
function GameCard({ icon: Icon, tileFg, tileBg, title, moment, purpose, skillTag, duration, playsToday, limit, onPlay }) {
  const { language } = useAuth();
  const mr = translations[language].mentalReps;
  const atLimit = playsToday >= limit;
  const tileStyle = { '--tile-fg': tileFg, '--tile-bg': tileBg };
  return (
    <div className="card-elevated p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="icon-tile" style={tileStyle}>
            <Icon size={20} />
          </div>
          <div>
            {moment && <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">{moment}</p>}
            <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
          </div>
        </div>
        <span className="tag-pill" style={tileStyle}>{skillTag}</span>
      </div>

      <p className="text-sm text-slt leading-relaxed">{purpose}</p>

      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>{duration}</span>
        <span>·</span>
        <span>{mr.playsToday(playsToday, limit)}</span>
      </div>

      <div className="flex items-center justify-end mt-1">
        {atLimit ? (
          <span className="text-xs text-slt font-medium px-4 py-3">{mr.comeBackTomorrow}</span>
        ) : (
          <button
            onClick={onPlay}
            className="btn-gradient text-sm px-8"
            style={{ minHeight: '56px' }}
          >
            {mr.play}
          </button>
        )}
      </div>
    </div>
  );
}

export default GameCard;
