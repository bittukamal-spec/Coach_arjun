import { AlertTriangle } from 'lucide-react';

// PR-7 (founder-dashboard security containment): the server's
// /api/founder/pulse endpoint (routes/founder.js) still authenticates with
// the old static FOUNDER_TOKEN, which this dashboard no longer holds — the
// containment work removed every browser-exposed static credential and
// must not send the new short-lived founder session token to an endpoint
// the server doesn't recognise it for. This panel is temporarily disabled
// until a follow-up PR migrates /api/founder/pulse to founderAuthenticate.
export default function PulsePanel() {
  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-[#F1F5F9]">Pulse</h1>
      </div>

      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 flex flex-col items-center text-center gap-2">
        <AlertTriangle size={28} className="text-[#F59E0B]" />
        <p className="text-sm font-semibold text-[#F1F5F9]">Temporarily unavailable</p>
        <p className="text-xs text-[#64748B]">
          Pulse is being migrated to the new secure founder session. It will return in a follow-up update.
        </p>
      </div>
    </div>
  );
}
