import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { founderFetch } from '../api';

const RISK_COLORS = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#94A3B8',
};

const OUTCOMES = ['NO_ACTION', 'FOLLOW_UP_REQUIRED', 'ESCALATED', 'FALSE_POSITIVE'];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function Badge({ children, color }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: `${color}22`, color }}
    >
      {children}
    </span>
  );
}

function EventRow({ event, onOpen }) {
  return (
    <button
      onClick={() => onOpen(event.id)}
      className="w-full text-left bg-[#1E293B] rounded-xl px-4 py-3 flex items-center justify-between gap-3 active:bg-[#334155] transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge color={RISK_COLORS[event.riskLevel] || '#94A3B8'}>{event.riskLevel || 'unknown'}</Badge>
          <span className="text-xs text-[#94A3B8]">{event.triggerType}</span>
        </div>
        <p className="text-sm text-[#F1F5F9] truncate">
          {event.user?.name || 'Unknown athlete'}
          {event.user?.sport ? ` · ${event.user.sport}` : ''}
        </p>
        <p className="text-xs text-[#64748B]">{event.surface} · {formatDate(event.createdAt)}</p>
      </div>
      <ChevronRight size={18} className="text-[#475569] shrink-0" />
    </button>
  );
}

function EventDetail({ event, onBack, onReviewed }) {
  const [outcome, setOutcome] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submitReview() {
    if (!outcome) return;
    setSaving(true);
    setError('');
    try {
      const r = await founderFetch(`/api/founder/safety-events/${event.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewStatus: 'REVIEWED', reviewOutcome: outcome }),
      });
      if (!r.ok) throw new Error('Could not save review.');
      const { event: updated } = await r.json();
      onReviewed(updated);
    } catch (e) {
      setError(e.message || 'Could not save review.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-[#94A3B8] active:text-[#F1F5F9]">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="bg-[#1E293B] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={RISK_COLORS[event.riskLevel] || '#94A3B8'}>{event.riskLevel || 'unknown'}</Badge>
          <Badge color="#1769AA">{event.reviewStatus}</Badge>
        </div>

        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-[#64748B]">Athlete</dt><dd className="text-[#F1F5F9]">{event.user?.name || '—'}{event.user?.sport ? ` · ${event.user.sport}` : ''}</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Surface</dt><dd className="text-[#F1F5F9]">{event.surface}</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Trigger type</dt><dd className="text-[#F1F5F9]">{event.triggerType}</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Source type</dt><dd className="text-[#F1F5F9]">{event.sourceType || '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-[#64748B]">Occurred</dt><dd className="text-[#F1F5F9]">{formatDate(event.createdAt)}</dd></div>
          {event.reviewedAt && (
            <div className="flex justify-between"><dt className="text-[#64748B]">Reviewed</dt><dd className="text-[#F1F5F9]">{formatDate(event.reviewedAt)} · {event.reviewOutcome}</dd></div>
          )}
        </dl>

        <p className="text-xs text-[#475569] pt-1">
          Structured metadata only — Arjun never stores or shows the athlete's original message here.
        </p>
      </div>

      {event.reviewStatus !== 'REVIEWED' && (
        <div className="bg-[#1E293B] rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[#F1F5F9]">Mark reviewed</p>
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map(o => (
              <button
                key={o}
                onClick={() => setOutcome(o)}
                className="text-xs font-medium px-3 py-2 rounded-lg border transition-colors"
                style={{
                  borderColor: outcome === o ? '#1769AA' : '#334155',
                  background:  outcome === o ? '#1769AA22' : 'transparent',
                  color:       outcome === o ? '#1769AA' : '#94A3B8',
                }}
              >
                {o.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={submitReview}
            disabled={!outcome || saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1769AA] text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            <ShieldCheck size={16} />
            {saving ? 'Saving…' : 'Mark reviewed'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SafetyPanel() {
  const [events, setEvents] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('UNREVIEWED');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === 'ALL' ? '' : `?reviewStatus=${filter}`;
      const r = await founderFetch(`/api/founder/safety-events${query}`);
      if (!r.ok) throw new Error(`${r.status}`);
      const { events } = await r.json();
      setEvents(events);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadList(); }, [loadList]);

  const openEvent = useCallback(async (id) => {
    setSelectedId(id);
    setSelected(null);
    try {
      const r = await founderFetch(`/api/founder/safety-events/${id}`);
      if (!r.ok) throw new Error(`${r.status}`);
      const { event } = await r.json();
      setSelected(event);
    } catch (e) {
      setError(e.message);
      setSelectedId(null);
    }
  }, []);

  function handleReviewed(updatedEvent) {
    setSelected(updatedEvent);
    setEvents(prev => (prev || []).map(e => (e.id === updatedEvent.id ? updatedEvent : e)));
  }

  if (selectedId) {
    if (!selected) {
      return (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-[#1769AA]" />
        </div>
      );
    }
    return (
      <EventDetail
        event={selected}
        onBack={() => { setSelectedId(null); setSelected(null); }}
        onReviewed={handleReviewed}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#F1F5F9]">Safety</h1>
        <button
          onClick={loadList}
          disabled={loading}
          className="p-2 rounded-lg bg-[#1E293B] text-[#94A3B8] active:bg-[#334155] disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-2">
        {['UNREVIEWED', 'ALL'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="text-xs font-medium px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: filter === f ? '#1769AA' : '#334155',
              background:  filter === f ? '#1769AA22' : 'transparent',
              color:       filter === f ? '#1769AA' : '#94A3B8',
            }}
          >
            {f === 'UNREVIEWED' ? 'Unreviewed' : 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          Failed to load safety events.
        </div>
      )}

      {loading && !events && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={28} className="animate-spin text-[#1769AA]" />
        </div>
      )}

      {events && events.length === 0 && (
        <div className="bg-[#1E293B] rounded-xl p-6 text-center text-sm text-[#64748B]">
          No {filter === 'UNREVIEWED' ? 'unreviewed' : ''} safety events.
        </div>
      )}

      {events && events.length > 0 && (
        <div className="space-y-2">
          {events.map(e => <EventRow key={e.id} event={e} onOpen={openEvent} />)}
        </div>
      )}
    </div>
  );
}
