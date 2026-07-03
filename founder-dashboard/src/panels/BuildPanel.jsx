import { useState, useEffect } from 'react';

const LS_KEY = 'fd_queue';

const STATUSES       = ['TODO', 'IN_PROGRESS', 'DONE'];
const NEXT_STATUS    = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE', DONE: 'TODO' };
const STATUS_STYLES  = {
  TODO:        { bg: '#1E293B', fg: '#94A3B8',  label: 'Todo'        },
  IN_PROGRESS: { bg: '#1E3A5F', fg: '#60A5FA',  label: 'In progress' },
  DONE:        { bg: '#14532D', fg: '#4ADE80',  label: 'Done'        },
};
const PRIORITY_STYLES = {
  RED:     { bg: '#7F1D1D', fg: '#FCA5A5', label: '🔴 RED'     },
  AMBER:   { bg: '#78350F', fg: '#FCD34D', label: '🟡 AMBER'   },
  GREEN:   { bg: '#14532D', fg: '#4ADE80', label: '🟢 GREEN'   },
  BACKLOG: { bg: '#1E293B', fg: '#64748B', label: '📋 BACKLOG' },
};
const PRIORITY_ORDER = ['RED', 'AMBER', 'GREEN', 'BACKLOG'];

const DEFAULT_QUEUE = [
  // RED
  { id: 'r1', priority: 'RED',  status: 'DONE', label: 'Quick chat has no safety scaffolding',                       notes: 'Fixed in RED fixes session — injury + crisis blocks + KIRAN added.' },
  { id: 'r2', priority: 'RED',  status: 'DONE', label: 'Trial gate missing on 8 AI endpoints',                       notes: 'Fixed — 3 Category A (429) + 5 Category B (skip-AI).' },
  { id: 'r3', priority: 'RED',  status: 'DONE', label: 'Selective deletion deletes wrong table (checkin-history)',    notes: 'Fixed — CheckIn.deleteMany added to userData.js.' },
  { id: 'r4', priority: 'RED',  status: 'DONE', label: 'Broken CSS vars --color-dark-600/700/800',                   notes: 'Fixed — 9 sites renamed + rgb() wrapper added.' },
  { id: 'r5', priority: 'RED',  status: 'TODO', label: 'No parental consent / no age gate at signup',                notes: 'DPDP exposure — minors product. Needs consent checkbox + age gate flow.' },

  // AMBER
  { id: 'a1',  priority: 'AMBER', status: 'DONE', label: 'KIRAN helpline missing from chat + Self-Talk',             notes: 'Fixed in RED 1 — added to both EN and Hinglish crisis messages.' },
  { id: 'a2',  priority: 'AMBER', status: 'TODO', label: 'Safety events are never logged or persisted',              notes: 'Founder cannot review a single crisis trigger. Needs DB table or log.' },
  { id: 'a3',  priority: 'AMBER', status: 'TODO', label: 'No message-retention job — quick chat messages persist',   notes: 'Best-effort client DELETE on tab-hide; killed browser = permanent. No scheduler dep installed.' },
  { id: 'a4',  priority: 'AMBER', status: 'TODO', label: 'Razorpay webhook not idempotent',                          notes: 'Replayed subscription.charged resets subscriptionStartDate. Add event-ID dedup.' },
  { id: 'a5',  priority: 'AMBER', status: 'TODO', label: 'Account deletion swallows Razorpay cancel failure',        notes: 'auth.js:252–254 — live sub can survive with no user record. Add reconciliation.' },
  { id: 'a6',  priority: 'AMBER', status: 'TODO', label: 'OCEAN personality scores fully dead + latent bug',         notes: 'Never written; reader in bounce_back wizard selects wrong fields — always undefined → 3.' },
  { id: 'a7',  priority: 'AMBER', status: 'TODO', label: 'Missing DB indexes on hot tables',                         notes: 'Message has no index; CheckIn, Debrief, DrillCompletion, GameSession also unindexed.' },
  { id: 'a8',  priority: 'AMBER', status: 'TODO', label: 'CORS allows all origins',                                  notes: 'index.js:27 cors({ origin: true }). CLIENT_URL not used for allow-list.' },
  { id: 'a9',  priority: 'AMBER', status: 'TODO', label: '[SUGGEST:] chips generated every reply, then discarded',   notes: 'Prompt mandates them; client strips and throws them. Wasted tokens every reply.' },
  { id: 'a10', priority: 'AMBER', status: 'TODO', label: 'Weekly reports lazy — no Monday push cadence',             notes: 'Generated on first Progress load if missing. Adds 1–2s latency; no proactive delivery.' },
  { id: 'a11', priority: 'AMBER', status: 'TODO', label: 'Daily drill orphaned from UI',                             notes: 'drills.js fully built + registered — zero client callers.' },
  { id: 'a12', priority: 'AMBER', status: 'TODO', label: 'Legacy /api/checkin route has no client caller',           notes: 'Only alive via mentalFitness dual-write. gratitude/reflection UI gone.' },
  { id: 'a13', priority: 'AMBER', status: 'TODO', label: 'Self-talk cards not in coaching context (only ToolReport)', notes: 'Cards never queried in chat.js; surface only as one-line ToolReport summary.' },
  { id: 'a14', priority: 'AMBER', status: 'TODO', label: 'MFS "Show all" toggle never built',                        notes: 'No showAll state in MentalFitnessCheckin.jsx or ProgressPage.jsx.' },
  { id: 'a15', priority: 'AMBER', status: 'TODO', label: 'Design drift — two brand blues + purple still present',    notes: 'brand.500=#1769AA vs hardcoded #185FA5. Purple #8B5CF6 in config + Dashboard/Train/SelfTalk.' },
  { id: 'a16', priority: 'AMBER', status: 'TODO', label: 'Small-text readability risk on mid-range Android',         notes: '68 instances of text-[9px/10px/11px] across 19 files.' },
  { id: 'a17', priority: 'AMBER', status: 'TODO', label: 'Stale / contradictory docs (PROJECT.md, PLAN.md)',         notes: 'PROJECT.md describes SQLite/MindGame era. CLAUDE.md claims incorrect CORS + built OCEAN test.' },

  // BACKLOG
  { id: 'b1', priority: 'BACKLOG', status: 'TODO', label: 'WhatsApp reminders',           notes: 'Env stubs only. phone/reminderOptIn schema fields unused. No SDK.' },
  { id: 'b2', priority: 'BACKLOG', status: 'TODO', label: 'Sentry error tracking',        notes: 'Not in any package.json; no init code.' },
  { id: 'b3', priority: 'BACKLOG', status: 'TODO', label: 'PostHog analytics',            notes: 'Not installed. PrivacyPage says "no third-party analytics" — must update policy when added.' },
  { id: 'b4', priority: 'BACKLOG', status: 'TODO', label: 'Personality test UI (OCEAN)',  notes: 'Schema fields ready; either build the test or drop the fields.' },
  { id: 'b5', priority: 'BACKLOG', status: 'TODO', label: 'Data export (right of access)', notes: 'Deletion exists; portability does not. DPDP requirement.' },
  { id: 'b6', priority: 'BACKLOG', status: 'TODO', label: 'Webhook event-ID dedup table', notes: 'Proper fix for AMBER 4.' },
  { id: 'b7', priority: 'BACKLOG', status: 'TODO', label: 'Avatar upload to server',      notes: 'User.avatar column exists but never written. Currently localStorage-only.' },
  { id: 'b8', priority: 'BACKLOG', status: 'TODO', label: 'Decide daily drill fate',      notes: 'Build a client entry point or delete drills.js + DrillCompletion model.' },
];

function loadQueue() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch {}
  return DEFAULT_QUEUE.map(i => ({ ...i }));
}

export default function BuildPanel() {
  const [items, setItems]     = useState(loadQueue);
  const [editing, setEditing] = useState(null); // id or null
  const [noteText, setNoteText] = useState('');

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(items)); }, [items]);

  function cycleStatus(id) {
    setItems(prev => prev.map(i =>
      i.id === id ? { ...i, status: NEXT_STATUS[i.status] } : i
    ));
  }

  function openNote(item) {
    setNoteText(item.notes || '');
    setEditing(item.id);
  }

  function saveNote() {
    setItems(prev => prev.map(i =>
      i.id === editing ? { ...i, notes: noteText } : i
    ));
    setEditing(null);
  }

  const grouped = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = items.filter(i => i.priority === p);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F1F5F9]">Build Queue</h1>
        <span className="text-xs text-[#64748B]">
          {items.filter(i => i.status === 'DONE').length}/{items.length} done
        </span>
      </div>

      {PRIORITY_ORDER.map(priority => {
        const group = grouped[priority];
        if (!group.length) return null;
        const { bg: pbg, fg: pfg, label: plabel } = PRIORITY_STYLES[priority];
        const doneCount = group.filter(i => i.status === 'DONE').length;

        return (
          <section key={priority}>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: pbg, color: pfg }}
              >
                {plabel}
              </span>
              <span className="text-xs text-[#475569]">{doneCount}/{group.length}</span>
            </div>

            <div className="space-y-2">
              {group.map(item => {
                const { bg: sbg, fg: sfg, label: slabel } = STATUS_STYLES[item.status];
                const isDone = item.status === 'DONE';

                return (
                  <div
                    key={item.id}
                    className="bg-[#1E293B] rounded-xl overflow-hidden"
                    style={{ opacity: isDone ? 0.55 : 1 }}
                  >
                    <div className="flex items-start gap-3 px-4 py-3">
                      {/* Status tap target */}
                      <button
                        onClick={() => cycleStatus(item.id)}
                        className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                        style={{
                          borderColor: sfg,
                          background: isDone ? sfg : 'transparent',
                        }}
                        title={`Click to set → ${NEXT_STATUS[item.status]}`}
                      >
                        {isDone && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through' : ''}`}
                          style={{ color: isDone ? '#64748B' : '#F1F5F9' }}>
                          {item.label}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{item.notes}</p>
                        )}
                        <button
                          onClick={() => openNote(item)}
                          className="text-[10px] text-[#475569] mt-1.5 underline underline-offset-2"
                        >
                          {item.notes ? 'Edit note' : 'Add note'}
                        </button>
                      </div>

                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: sbg, color: sfg }}
                      >
                        {slabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Note edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="relative bg-[#1E293B] rounded-t-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-[#F1F5F9]">Edit note</h2>
            <textarea
              rows={4}
              autoFocus
              className="w-full bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9] placeholder-[#475569] focus:outline-none focus:border-[#1769AA] resize-none"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <button
              onClick={saveNote}
              className="w-full bg-[#1769AA] text-white font-semibold py-3 rounded-xl"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
