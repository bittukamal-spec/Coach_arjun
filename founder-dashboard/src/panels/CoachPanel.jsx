import { useState, useEffect } from 'react';
import { Plus, X, ChevronRight } from 'lucide-react';

const LS_KEY = 'fd_coaches';

const CONTACT_TYPES   = ['School', 'Club', 'Coach', 'Player', 'Other'];
const STATUSES        = ['Not Contacted', 'Reached Out', 'Responded', 'Trialling', 'Converted', 'Passed'];
const STATUS_COLORS   = {
  'Not Contacted': ['#1E293B', '#94A3B8'],
  'Reached Out':   ['#1E3A5F', '#93C5FD'],
  'Responded':     ['#1E3A5F', '#60A5FA'],
  'Trialling':     ['#312E81', '#A78BFA'],
  'Converted':     ['#14532D', '#4ADE80'],
  'Passed':        ['#374151', '#6B7280'],
};

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
function uid() { return Math.random().toString(36).slice(2, 9); }

const EMPTY = { name: '', org: '', type: 'Club', status: 'Not Contacted', notes: '', lastContact: '' };

export default function CoachPanel() {
  const [contacts, setContacts] = useState(load);
  const [modal, setModal]       = useState(null); // null | 'add' | contact-id
  const [form, setForm]         = useState(EMPTY);

  useEffect(() => { save(contacts); }, [contacts]);

  const sorted = [...contacts].sort((a, b) =>
    (b.lastContact || '').localeCompare(a.lastContact || '')
  );

  function openAdd() {
    setForm({ ...EMPTY, lastContact: new Date().toISOString().slice(0, 10) });
    setModal('add');
  }

  function openEdit(c) {
    setForm({ ...c });
    setModal(c.id);
  }

  function submit() {
    if (!form.name.trim()) return;
    if (modal === 'add') {
      setContacts(prev => [...prev, { ...form, id: uid() }]);
    } else {
      setContacts(prev => prev.map(c => c.id === modal ? { ...form, id: modal } : c));
    }
    setModal(null);
  }

  const inputClass = 'w-full bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9] placeholder-[#475569] focus:outline-none focus:border-[#1769AA]';
  const labelClass = 'block text-xs font-medium text-[#94A3B8] mb-1 uppercase tracking-wide';

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-[#F1F5F9]">Coach Tracker</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-[#1769AA] text-white text-sm font-medium px-3 py-2 rounded-lg"
        >
          <Plus size={16} />
          Add
        </button>
      </div>

      {contacts.length === 0 && (
        <p className="text-center text-[#475569] text-sm py-16">No contacts yet. Tap + Add to start.</p>
      )}

      <div className="space-y-2">
        {sorted.map(c => {
          const [bg, fg] = STATUS_COLORS[c.status] || STATUS_COLORS['Not Contacted'];
          return (
            <button
              key={c.id}
              onClick={() => openEdit(c)}
              className="w-full text-left bg-[#1E293B] rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#F1F5F9] truncate">{c.name}</span>
                  <span className="text-xs text-[#64748B]">{c.type}</span>
                </div>
                {c.org && <div className="text-xs text-[#94A3B8] truncate">{c.org}</div>}
                {c.lastContact && <div className="text-[10px] text-[#475569] mt-0.5">{c.lastContact}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                  style={{ background: bg, color: fg }}
                >
                  {c.status}
                </span>
                <ChevronRight size={16} className="text-[#475569]" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative bg-[#1E293B] rounded-t-2xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#F1F5F9]">
                {modal === 'add' ? 'New contact' : 'Edit contact'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1 text-[#64748B]">
                <X size={20} />
              </button>
            </div>

            <div>
              <label className={labelClass}>Name *</label>
              <input className={inputClass} placeholder="Name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div>
              <label className={labelClass}>Organisation</label>
              <input className={inputClass} placeholder="School / club / academy" value={form.org}
                onChange={e => setForm(f => ({ ...f, org: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Type</label>
                <select className={inputClass + ' appearance-none'} value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {CONTACT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass + ' appearance-none'} value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Last contact</label>
              <input type="date" className={inputClass} value={form.lastContact}
                onChange={e => setForm(f => ({ ...f, lastContact: e.target.value }))} />
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea rows={3} className={inputClass + ' resize-none'} placeholder="Notes..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <button
              onClick={submit}
              className="w-full bg-[#1769AA] text-white font-semibold py-3 rounded-xl"
            >
              {modal === 'add' ? 'Add contact' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
