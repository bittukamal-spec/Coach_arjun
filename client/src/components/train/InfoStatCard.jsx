// One mini stat tile (Duration / Best for / Goal) — used in a row of 2-3
// on a tool-intro screen.
function InfoStatCard({ label, value }) {
  return (
    <div className="info-stat">
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xs font-semibold text-ink leading-snug">{value}</p>
    </div>
  );
}

export default InfoStatCard;
