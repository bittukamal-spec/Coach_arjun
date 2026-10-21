import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { Trophy, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { translations } from '../i18n/translations';
import { apiFetch } from '../api';
import { Button, Card, PageHeader, SectionLabel } from '../components/ui';
import { SafetyGuidanceCard } from './mindJournal/shared';

// ─── Ritual rebuild (PR 3) — the athlete's saved routines. /ritual now reads
// and writes /api/routines (up to 5 routines) instead of the legacy single
// ritual on /api/ritual/me. Screens: list → detail → builder / walkthrough,
// all on this one route, like the page it replaces.
//
// The legacy single ritual is imported once, automatically, the first time
// this page sees one (POST /api/routines/import-legacy is repeat-safe). From
// then on the server keeps the legacy fields as a mirror of that routine, so
// Coach and any cached old client keep seeing it.
//
// Saves can be safety-flagged: the server then answers 200 with
// { safetyFlag: 'needs_support', guidance } and writes nothing. The page
// shows the standard guidance card and keeps the athlete's text in place.
// No AI, no suggestions here — suggestions arrive in a later PR.
//
// The builder is deliberately plain (MVP spec §4.7: no complex routine
// builder): a name, when it's for, and up to 5 one-line steps. Steps typed
// here are saved as kind "custom" with no cue; a step that already has a
// kind or cue (imported, or from a later suggestion) keeps them on save. ───

const CATEGORIES = ['session_preparation', 'repeated_moment', 'pressure_moment', 'own_situation'];
const MAX_STEPS = 5;
const DEFAULT_LIMIT = 5;
// Limits mirror server/src/services/routines/validateRoutine.js.
const NAME_MAX = 60;
const INSTRUCTION_MAX = 120;

// One import attempt per browser session: a legacy ritual the safety screen
// flags stays un-imported, and retrying on every visit would re-record the
// same safety event each time.
const IMPORT_TRIED_KEY = 'arjun_ritual_import_tried';

function importAlreadyTried() {
  try { return sessionStorage.getItem(IMPORT_TRIED_KEY) === '1'; } catch { return false; }
}
function markImportTried() {
  try { sessionStorage.setItem(IMPORT_TRIED_KEY, '1'); } catch { /* best effort */ }
}

const inputClass =
  'w-full bg-dark-700 border border-dark-500 text-ink rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slt';

let localKeySeq = 0;
const nextLocalKey = () => `local-${++localKeySeq}`;

// Builder rows carry the saved step plus the wording it was loaded with, so
// an edited suggested/existing step can be re-marked as the athlete's own.
// kind and cue are not editable here; they pass through unchanged.
function toEditableStep(step) {
  return {
    key: step.id || nextLocalKey(),
    id: step.id || null,
    kind: step.kind || 'custom',
    instruction: step.instruction || '',
    cue: step.cue || null,
    origin: step.origin || 'custom',
    loadedInstruction: step.instruction || '',
  };
}

function blankStep() {
  return toEditableStep({ kind: 'custom', instruction: '', cue: null, origin: 'custom' });
}

function toRequestStep(s) {
  const instruction = s.instruction.trim();
  const origin = s.id && instruction === s.loadedInstruction.trim() ? s.origin : 'custom';
  return {
    ...(s.id ? { id: s.id } : {}),
    kind: s.kind,
    instruction,
    cue: s.cue,
    origin,
  };
}

function routineTitle(routine, t) {
  return routine?.name || t.untitled;
}

// ── Builder (create + edit) ───────────────────────────────────────────────────

function Builder({ initial, onSubmit, onCancel, t }) {
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || null);
  const [steps, setSteps] = useState(() => (
    initial?.steps?.length ? initial.steps.map(toEditableStep) : [blankStep()]
  ));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Set when the server's safety screen flagged the save. Nothing was
  // saved; the athlete sees the standard guidance instead of a generic error.
  const [safety, setSafety] = useState(null);
  const ids = useId();

  function addStep() {
    if (steps.length >= MAX_STEPS) return;
    setSteps(prev => [...prev, blankStep()]);
  }

  function removeStep(key) {
    setSteps(prev => prev.filter(s => s.key !== key));
  }

  function updateStep(key, instruction) {
    setSteps(prev => prev.map(s => (s.key === key ? { ...s, instruction } : s)));
  }

  async function handleSave() {
    if (saving) return;
    if (!name.trim()) { setError(t.errNameRequired); return; }
    if (!category) { setError(t.errCategoryRequired); return; }
    const filled = steps.filter(s => s.instruction.trim());
    if (filled.length === 0) { setError(t.errAddStep); return; }
    setSaving(true);
    setError('');
    setSafety(null);
    try {
      const outcome = await onSubmit({ name: name.trim(), category, steps: filled.map(toRequestStep) });
      if (outcome.safety) setSafety({ guidance: outcome.safety.guidance || null });
      else if (outcome.error) setError(outcome.error);
    } catch {
      setError(t.errSave);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {safety && <SafetyGuidanceCard guidance={safety.guidance} onDismiss={() => setSafety(null)} />}

      <div className="mb-6">
        <label htmlFor={`${ids}-name`} className="block text-sm font-semibold text-ink mb-2">{t.nameLabel}</label>
        <input
          id={`${ids}-name`}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t.namePlaceholder}
          maxLength={NAME_MAX}
          className={inputClass}
        />
      </div>

      <fieldset className="mb-6">
        <legend className="block text-sm font-semibold text-ink mb-2">{t.categoryLabel}</legend>
        <div className="flex flex-col gap-2" role="radiogroup">
          {CATEGORIES.map(c => {
            const selected = category === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategory(c)}
                className={`text-left rounded-2xl border px-4 py-3 min-h-[48px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selected ? 'bg-brand-500/15 border-brand-500/60' : 'bg-dark-800 border-dark-600 hover:border-dark-400'
                }`}
              >
                <span className={`block text-sm font-semibold ${selected ? 'text-brand-500' : 'text-ink'}`}>{t.categories[c]}</span>
                <span className="block text-caption text-slt mt-0.5">{t.categoryHints[c]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-body font-semibold text-ink">{t.steps}</p>
          <p className="text-xs text-slt">{t.maxSteps}</p>
        </div>

        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step.key} className="bg-dark-700 border border-dark-500 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-caption font-semibold text-slt uppercase tracking-wide">{t.stepN(i + 1)}</span>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(step.key)}
                    className="text-caption text-red-400 hover:text-red-300 transition-colors py-1 px-1"
                  >
                    {t.removeStep}
                  </button>
                )}
              </div>

              <input
                aria-label={`${t.stepN(i + 1)}: ${t.stepTextLabel}`}
                value={step.instruction}
                onChange={e => updateStep(step.key, e.target.value)}
                placeholder={t.stepExamples[i] || t.stepExamples[t.stepExamples.length - 1]}
                maxLength={INSTRUCTION_MAX}
                className="w-full bg-dark-800 border border-dark-600 text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-slt"
              />
            </li>
          ))}
        </ol>

        {steps.length < MAX_STEPS && (
          <button
            type="button"
            onClick={addStep}
            className="mt-3 w-full py-3 border-2 border-dashed border-dark-500 text-slt hover:text-ink hover:border-dark-400 rounded-2xl text-sm font-medium transition-all"
          >
            {t.addStep}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400 bg-red-950/20 border border-red-900/20 rounded-xl px-4 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? t.savingBtn : t.save}
        </Button>
        <button type="button" onClick={onCancel} className="btn-secondary justify-center">
          {t.cancel}
        </button>
      </div>
    </div>
  );
}

// ── Walkthrough ───────────────────────────────────────────────────────────────

function Walkthrough({ steps, t, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);

  const step = steps[stepIdx];
  const progress = (stepIdx / steps.length) * 100;

  function advance() {
    if (stepIdx < steps.length - 1) setStepIdx(i => i + 1);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 animate-fade-in">
        <div className="mb-6"><Trophy size={56} className="text-fire-500 mx-auto" aria-hidden="true" /></div>
        <h2 className="text-2xl font-bold text-ink mb-3">{t.doneTitle}</h2>
        <p className="text-slt mb-10 max-w-xs">{t.doneSub}</p>
        <Button type="button" onClick={onFinish} className="px-10">{t.doneBack}</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-fade-in">
      <div className="h-1 bg-dark-700 mb-8">
        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="text-xs font-semibold text-slt uppercase tracking-wide mb-6">
          {t.walkthroughOf(stepIdx + 1, steps.length)}
        </p>

        <div className="w-24 h-24 rounded-full bg-brand-500/15 border-2 border-brand-500/40 flex items-center justify-center mb-6" aria-hidden="true">
          <span className="text-title font-bold text-brand-500">{stepIdx + 1}</span>
        </div>

        <h2 className="text-title font-bold text-ink mb-3 leading-tight max-w-xs">{step.instruction}</h2>
        {step.cue && <p className="text-body font-semibold text-brand-500 mb-2">“{step.cue}”</p>}

        <div className="flex gap-2 mt-2" aria-hidden="true">
          {steps.map((s, i) => (
            <div
              key={s.id || i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === stepIdx ? 'bg-brand-400 scale-125' : i < stepIdx ? 'bg-brand-700' : 'bg-dark-600'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 pt-8 shrink-0 max-w-lg w-full mx-auto">
        <Button type="button" onClick={advance} className="w-full text-base">
          {stepIdx < steps.length - 1 ? t.nextStep : t.finish}
        </Button>
      </div>
    </div>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirm({ t, deleting, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const ids = useId();

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        className="bg-dark-800 border border-dark-500 rounded-2xl p-6 w-full max-w-md animate-slide-up text-left"
      >
        <h2 id={`${ids}-title`} className="font-bold text-ink mb-2 text-body">{t.deleteTitle}</h2>
        <p id={`${ids}-body`} className="text-slt text-sm mb-6 leading-relaxed">{t.deleteBody}</p>
        {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 btn-secondary min-h-[48px]"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {deleting ? t.deleting : t.deleteConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function RitualPage() {
  const { token, language } = useAuth();
  const t = translations[language].ritual;

  // view.name: loading | error | list | detail | build | walk
  // view.id:   the routine shown (detail/walk) or edited (build; null = new)
  const [view, setView] = useState({ name: 'loading', id: null });
  const [routines, setRoutines] = useState([]);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  // Guidance from a flagged legacy import, shown above the list.
  const [importSafety, setImportSafety] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const savedTimer = useRef(null);

  const authHeaders = useCallback(
    (json = false) => ({
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }),
    [token]
  );

  const fetchList = useCallback(async () => {
    const res = await apiFetch('/api/routines', { headers: authHeaders() });
    if (!res.ok) throw new Error('load_failed');
    return res.json();
  }, [authHeaders]);

  const load = useCallback(async () => {
    setView({ name: 'loading', id: null });
    try {
      let data = await fetchList();
      if (data?.legacy?.status === 'available' && !importAlreadyTried()) {
        markImportTried();
        try {
          const res = await apiFetch('/api/routines/import-legacy', { method: 'POST', headers: authHeaders(true) });
          const result = await res.json().catch(() => null);
          if (result?.safetyFlag === 'needs_support') setImportSafety({ guidance: result.guidance || null });
          else if (result?.status === 'imported') data = await fetchList();
        } catch { /* the list still loads; import is retried next session */ }
      }
      setRoutines(Array.isArray(data?.routines) ? data.routines : []);
      setLimit(Number.isInteger(data?.limit) ? data.limit : DEFAULT_LIMIT);
      setView({ name: 'list', id: null });
    } catch {
      setView({ name: 'error', id: null });
    }
  }, [fetchList, authHeaders]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const current = view.id ? routines.find(r => r.id === view.id) || null : null;
  const atLimit = routines.length >= limit;

  function showSaved() {
    setSavedMsg(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedMsg(false), 3000);
  }

  // Resolves to { safety } or { error } for the builder to show, or {} after
  // a real save (when the page has already moved to the saved routine).
  async function submitRoutine(body) {
    const editing = view.id;
    const res = await apiFetch(editing ? `/api/routines/${editing}` : '/api/routines', {
      method: editing ? 'PATCH' : 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    // A flagged save is a 200 with no routine — check before res.ok.
    if (data?.safetyFlag === 'needs_support') return { safety: { guidance: data.guidance || null } };
    if (!res.ok || !data?.routine) {
      return { error: data?.error === 'routine_limit_reached' ? t.limitReached(limit) : t.errSave };
    }
    const saved = data.routine;
    setRoutines(prev => (editing ? prev.map(r => (r.id === saved.id ? saved : r)) : [...prev, saved]));
    setView({ name: 'detail', id: saved.id });
    showSaved();
    return {};
  }

  async function handleDelete() {
    if (deleting || !current) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await apiFetch(`/api/routines/${current.id}`, { method: 'DELETE', headers: authHeaders() });
      // Already gone (404) is the outcome the athlete asked for.
      if (!res.ok && res.status !== 404) throw new Error('delete_failed');
      setRoutines(prev => prev.filter(r => r.id !== current.id));
      setConfirmDelete(false);
      setView({ name: 'list', id: null });
    } catch {
      setDeleteError(t.errDelete);
    } finally {
      setDeleting(false);
    }
  }

  const goList = () => setView({ name: 'list', id: null });
  const cancelDelete = useCallback(() => { setConfirmDelete(false); setDeleteError(''); }, []);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (view.name === 'loading') {
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <PageHeader backTo="/train" title={t.title} />
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Load error ───────────────────────────────────────────────────────────

  if (view.name === 'error') {
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <PageHeader backTo="/train" title={t.title} />
        <main className="max-w-lg mx-auto px-page py-8">
          <Card className="p-5">
            <p className="text-body text-slt mb-4">{t.errLoad}</p>
            <Button type="button" onClick={load}>{t.retry}</Button>
          </Card>
        </main>
      </div>
    );
  }

  // ── Walkthrough ──────────────────────────────────────────────────────────

  if (view.name === 'walk' && current) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col pb-20">
        <PageHeader onBack={() => setView({ name: 'detail', id: current.id })} title={routineTitle(current, t)} />
        <Walkthrough steps={current.steps} t={t} onFinish={() => setView({ name: 'detail', id: current.id })} />
      </div>
    );
  }

  // ── Builder ──────────────────────────────────────────────────────────────

  if (view.name === 'build') {
    const editing = view.id ? current : null;
    const back = editing ? () => setView({ name: 'detail', id: editing.id }) : goList;
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <PageHeader onBack={back} title={editing ? t.editTitle : t.newTitle} />
        <main className="max-w-lg mx-auto px-page py-6">
          <Builder
            key={view.id || 'new'}
            initial={editing}
            onSubmit={submitRoutine}
            onCancel={back}
            t={t}
          />
        </main>
      </div>
    );
  }

  // ── Detail ───────────────────────────────────────────────────────────────

  if (view.name === 'detail' && current) {
    return (
      <div className="min-h-screen bg-dark-900 pb-20">
        <PageHeader onBack={goList} title={routineTitle(current, t)} />
        <main className="max-w-lg mx-auto px-page py-6 animate-fade-in">
          {savedMsg && (
            <p role="status" className="mb-4 text-center text-win-400 text-sm font-semibold animate-fade-in">
              {t.saved}
            </p>
          )}

          <p className="text-caption text-slt mb-5">
            {t.categories[current.category] || t.categories.own_situation} · {t.stepsCount(current.steps.length)}
          </p>

          <SectionLabel>{t.steps}</SectionLabel>
          <ol className="flex flex-col gap-3 mb-8">
            {current.steps.map((step, i) => (
              <li key={step.id || i} className="flex items-center gap-4 card-surface px-4 py-3.5">
                <div className="w-8 h-8 rounded-full bg-dark-700 border border-dark-500 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slt">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink leading-tight">{step.instruction}</p>
                  {step.cue && <p className="text-xs text-slt mt-0.5">“{step.cue}”</p>}
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-col gap-3">
            <Button type="button" onClick={() => setView({ name: 'walk', id: current.id })} className="w-full text-base">
              {t.start}
            </Button>
            <Button type="button" variant="outline" onClick={() => setView({ name: 'build', id: current.id })} className="w-full">
              {t.edit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setDeleteError(''); setConfirmDelete(true); }}
              className="w-full text-red-400 hover:text-red-300"
            >
              {t.delete}
            </Button>
          </div>
        </main>

        {confirmDelete && (
          <DeleteConfirm
            t={t}
            deleting={deleting}
            error={deleteError}
            onCancel={cancelDelete}
            onConfirm={handleDelete}
          />
        )}
      </div>
    );
  }

  // ── List (also the fallback when a detail/walk routine is gone) ──────────

  return (
    <div className="min-h-screen bg-dark-900 pb-20">
      <PageHeader backTo="/train" title={t.title} />
      <main className="max-w-lg mx-auto px-page py-6 animate-fade-in">
        {importSafety && (
          <SafetyGuidanceCard guidance={importSafety.guidance} onDismiss={() => setImportSafety(null)} />
        )}

        <p className="text-body text-slt leading-relaxed mb-6">{t.subtitle}</p>

        {routines.length === 0 ? (
          <Card className="p-5 mb-6 text-center">
            <Trophy size={40} className="text-fire-500 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-heading font-bold text-ink mb-1">{t.emptyTitle}</h2>
            <p className="text-body text-slt">{t.emptySub}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3 mb-6">
            {routines.map(r => (
              <li key={r.id}>
                <Card
                  as="button"
                  type="button"
                  onClick={() => setView({ name: 'detail', id: r.id })}
                  className="w-full text-left px-4 py-4 flex items-center gap-3 min-h-[64px] hover:border-dark-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-semibold text-ink truncate">{routineTitle(r, t)}</p>
                    <p className="text-caption text-slt mt-0.5">
                      {t.categories[r.category] || t.categories.own_situation} · {t.stepsCount(r.steps.length)}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-slt shrink-0" aria-hidden="true" />
                </Card>
              </li>
            ))}
          </ul>
        )}

        {atLimit ? (
          <p className="text-caption text-slt text-center">{t.limitReached(limit)}</p>
        ) : (
          <Button type="button" onClick={() => setView({ name: 'build', id: null })} className="w-full">
            <Plus size={18} aria-hidden="true" />
            {t.newRoutine}
          </Button>
        )}
      </main>
    </div>
  );
}

export default RitualPage;
