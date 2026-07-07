import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';

// Hub card for one game on the Mental Reps page.
function GameCard({ icon: Icon, tileFg, tileBg, title, purpose, skillTag, playsToday, limit, onPlay }) {
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
          <h2 className="text-base font-bold text-ink">{title}</h2>
        </div>
        <span className="tag-pill" style={tileStyle}>{skillTag}</span>
      </div>

      <p className="text-sm text-slt leading-relaxed">{purpose}</p>

      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted font-medium">{mr.playsToday(playsToday, limit)}</span>
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
