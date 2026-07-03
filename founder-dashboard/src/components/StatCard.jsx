export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-[#1E293B] rounded-xl p-4 flex flex-col gap-1">
      <span className="text-[#94A3B8] text-xs font-medium uppercase tracking-wide">{label}</span>
      <span
        className="text-2xl font-bold leading-none"
        style={{ color: accent || '#F1F5F9' }}
      >
        {value ?? '—'}
      </span>
      {sub && <span className="text-[#64748B] text-xs">{sub}</span>}
    </div>
  );
}
