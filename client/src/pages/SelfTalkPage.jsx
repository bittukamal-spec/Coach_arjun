import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import { translations } from '../i18n/translations';
import HelplineList from '../components/HelplineList';
import ToolIntroLayout from '../components/train/ToolIntroLayout';

export default function SelfTalkPage() {
  const { user, token, language } = useAuth();
  const navigate = useNavigate();
  const t = translations[language]?.selfTalk || translations.en.selfTalk;
  const tSkill = translations[language]?.skillPathFocus || translations.en.skillPathFocus;
  const hi = language === 'hi';

  const [screen, setScreen] = useState(1);
  const [showSoftGate, setShowSoftGate] = useState(false);
  const [form, setForm] = useState({
    sport: user?.sport || '',
    roleOrPosition: user?.position || '',
    performanceMoment: '',
    skillContext: '',
    situationCategory: '',
    situationText: '',
    oldThought: '',
    thoughtIntensityBefore: null,
    confidenceBefore: null,
    confidenceAfter: null,
  });
  const [card, setCard] = useState(null);
  const [savedCard, setSavedCard] = useState(null);
  const [safetyFlag, setSafetyFlag] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maxCardsError, setMaxCardsError] = useState(false);
  const [practiceStep, setPracticeStep] = useState(0);
  const [practiceDone, setPracticeDone] = useState(false);
  const cancelledRef = useRef(false);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // ── Soft gate: has the athlete passed the Focus/Self-Talk Quick Check? ──
  useEffect(() => {
    apiFetch('/api/skills/focus_self_talk', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setShowSoftGate(!data?.quickCheckPassedAt))
      .catch(() => setShowSoftGate(false));
  }, [token]);

  // ── Generate (screen 5) ──────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 5) return;
    cancelledRef.current = false;
    setGenerating(true);
    setGenerateError(false);
    setSafetyFlag(null);

    apiFetch('/api/self-talk/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sport: form.sport,
        roleOrPosition: form.roleOrPosition,
        performanceMoment: form.performanceMoment,
        skillContext: form.skillContext,
        situationCategory: form.situationCategory,
        situationText: form.situationText,
        oldThought: form.oldThought,
        thoughtIntensityBefore: form.thoughtIntensityBefore,
        confidenceBefore: form.confidenceBefore,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error('server_error');
        return r.json();
      })
      .then(data => {
        if (cancelledRef.current) return;
        if (data.safetyFlag === 'needs_support') {
          setSafetyFlag('needs_support');
        } else {
          setCard(data);
          setScreen(6);
        }
      })
      .catch(() => {
        if (!cancelledRef.current) setGenerateError(true);
      })
      .finally(() => {
        if (!cancelledRef.current) setGenerating(false);
      });

    return () => { cancelledRef.current = true; };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Practice auto-advance ────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'practice') return;
    if (practiceStep >= 3) return;
    const t = setTimeout(() => setPracticeStep(s => s + 1), 3000);
    return () => clearTimeout(t);
  }, [screen, practiceStep]);

  const goBack = () => {
    if (screen === 1) { navigate('/train'); return; }
    if (screen === 'practice') { setScreen(7); return; }
    if (screen === 'done') { setScreen('practice'); return; }
    if (typeof screen === 'number') setScreen(s => s - 1);
  };

  const handleSave = async () => {
    if (!card) return;
    setSaving(true);
    setMaxCardsError(false);
    try {
      const r = await apiFetch('/api/self-talk/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, ...card }),
      });
      const data = await r.json();
      if (data.error === 'max_cards_reached') {
        setMaxCardsError(true);
      } else {
        setSavedCard(data.card);
        setScreen(7);
      }
    } catch {
      setMaxCardsError(true);
    } finally {
      setSaving(false);
    }
  };

  const handlePractice = async () => {
    if (savedCard) {
      await apiFetch(`/api/self-talk/cards/${savedCard.id}/practice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).catch(() => {});
    }
    setPracticeStep(0);
    setPracticeDone(false);
    setScreen('practice');
  };

  // ── Shared header ────────────────────────────────────────────────────────
  const Header = ({ progress }) => (
    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
      <button onClick={goBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
        <ArrowLeft size={18} className="text-ink" />
      </button>
      {progress && (
        <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: progress }} />
        </div>
      )}
    </div>
  );

  // ── SCREEN 1: Learn ──────────────────────────────────────────────────────
  if (screen === 1) return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header />
      <div className="flex-1 px-4 pt-2 pb-8 overflow-y-auto">
        <ToolIntroLayout
          icon={MessageSquare}
          variant="blue"
          tag={t.learn.duration}
          title={t.learn.title}
          desc={t.learn.desc}
          stats={[
            { label: hi ? 'समय' : 'Duration', value: t.learn.duration },
            { label: hi ? 'किसके लिए' : 'Best for', value: hi ? 'दबाव वाली सोच' : 'Pressure thoughts' },
            { label: hi ? 'लक्ष्य' : 'Goal', value: hi ? 'अपना Focus Card' : 'Your own Focus Card' },
          ]}
          checklist={{
            title: hi ? 'क्या उम्मीद करें' : 'What to expect',
            items: [t.learn.benefit1, t.learn.benefit2, t.learn.benefit3],
          }}
        />

        <div className="bg-dark-800 rounded-2xl p-4 mb-8">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-1">{t.learn.educTitle}</p>
          <p className="text-sm text-slt">{t.learn.educBody}</p>
        </div>

        {showSoftGate && (
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl p-4 mb-6">
            <p className="text-sm text-ink mb-3">{tSkill.softGate.message}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/skills/focus-self-talk')}
                className="text-sm font-semibold text-white bg-brand-500 px-4 py-2 rounded-xl active:scale-95 transition-transform"
              >
                {tSkill.softGate.learnFirst}
              </button>
              <button
                onClick={() => setShowSoftGate(false)}
                className="text-sm font-medium text-slt active:opacity-70"
              >
                {tSkill.softGate.continueAnyway}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="px-4 pb-8 pt-2">
        <button
          onClick={() => setScreen(2)}
          className="btn-gradient w-full py-3.5"
          style={{ minHeight: '52px' }}
        >
          {t.learn.startBtn}
        </button>
      </div>
    </div>
  );

  // ── SCREEN 2: Sport Context ──────────────────────────────────────────────
  if (screen === 2) return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header progress="28%" />
      <div className="flex-1 px-4 pt-2 pb-8 overflow-y-auto">
        <p className="text-xs text-slt mb-1">{t.sport.progress}</p>
        <h2 className="text-xl font-bold text-ink mb-5">{t.sport.heading}</h2>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slt uppercase tracking-wider">{t.sport.sportLabel}</label>
            {form.sport && user?.sport && form.sport === user.sport ? (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink capitalize">{form.sport}</div>
                <button onClick={() => setField('sport', '')} className="text-xs text-brand-400">{t.sport.changeSport}</button>
              </div>
            ) : (
              <input
                className="mt-1.5 w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-brand-500"
                placeholder={t.sport.sportHint}
                value={form.sport}
                onChange={e => setField('sport', e.target.value)}
              />
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slt uppercase tracking-wider">{t.sport.roleLabel}</label>
            <input
              className="mt-1.5 w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-brand-500"
              placeholder={t.sport.rolePlaceholder}
              value={form.roleOrPosition}
              onChange={e => setField('roleOrPosition', e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slt uppercase tracking-wider">
              {t.sport.momentLabel} <span className="text-red-400">*</span>
            </label>
            <input
              className="mt-1.5 w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-brand-500"
              placeholder={t.sport.momentPlaceholder}
              value={form.performanceMoment}
              onChange={e => setField('performanceMoment', e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slt uppercase tracking-wider">{t.sport.skillLabel}</label>
            <input
              className="mt-1.5 w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-brand-500"
              placeholder={t.sport.skillPlaceholder}
              value={form.skillContext}
              onChange={e => setField('skillContext', e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="px-4 pb-8 pt-2">
        <button
          disabled={!form.performanceMoment.trim()}
          onClick={() => setScreen(3)}
          className="w-full bg-brand-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
        >
          {t.sport.nextBtn}
        </button>
      </div>
    </div>
  );

  // ── SCREEN 3: Situation ──────────────────────────────────────────────────
  const SITUATION_OPTIONS = [
    { key: 'before_competition', label: t.situation.opt1 },
    { key: 'during_pressure', label: t.situation.opt2 },
    { key: 'after_mistake', label: t.situation.opt3 },
    { key: 'selection_trials', label: t.situation.opt4 },
    { key: 'being_watched', label: t.situation.opt5 },
    { key: 'low_confidence', label: t.situation.opt6 },
    { key: 'technical_focus', label: t.situation.opt7 },
    { key: 'fitness_effort', label: t.situation.opt8 },
    { key: 'custom', label: t.situation.opt9 },
  ];

  if (screen === 3) return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header progress="42%" />
      <div className="flex-1 px-4 pt-2 pb-8 overflow-y-auto">
        <p className="text-xs text-slt mb-1">{t.situation.progress}</p>
        <h2 className="text-xl font-bold text-ink mb-5">{t.situation.heading}</h2>

        <div className="grid grid-cols-1 gap-2 mb-4">
          {SITUATION_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => {
                setField('situationCategory', opt.key);
                if (opt.key !== 'custom') setField('situationText', '');
              }}
              className={`text-left px-4 py-3.5 rounded-2xl border text-sm font-medium transition-colors active:scale-[0.98] ${
                form.situationCategory === opt.key
                  ? 'bg-brand-500/15 border-brand-500 text-brand-400'
                  : 'bg-dark-800 border-dark-600 text-slt'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {form.situationCategory === 'custom' && (
          <textarea
            className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-brand-500 resize-none"
            rows={3}
            placeholder={t.situation.customPlaceholder}
            value={form.situationText}
            onChange={e => setField('situationText', e.target.value)}
          />
        )}
      </div>
      <div className="px-4 pb-8 pt-2">
        <button
          disabled={!form.situationCategory || (form.situationCategory === 'custom' && !form.situationText.trim())}
          onClick={() => setScreen(4)}
          className="w-full bg-brand-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
        >
          {hi ? 'आगे बढ़ो' : 'Next'}
        </button>
      </div>
    </div>
  );

  // ── SCREEN 4: Thought ────────────────────────────────────────────────────
  const THOUGHT_OPTIONS = [
    { key: 'what_if_i_fail', label: t.thought.opt1 },
    { key: 'not_good_enough', label: t.thought.opt2 },
    { key: 'everyone_better', label: t.thought.opt3 },
    { key: 'coach_will_drop', label: t.thought.opt4 },
    { key: 'always_mistakes', label: t.thought.opt5 },
    { key: 'feel_nervous', label: t.thought.opt6 },
    { key: 'cant_handle_pressure', label: t.thought.opt7 },
    { key: 'overthinking_technique', label: t.thought.opt8 },
    { key: 'custom', label: t.thought.opt9 },
  ];

  if (screen === 4) return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header progress="57%" />
      <div className="flex-1 px-4 pt-2 pb-8 overflow-y-auto">
        <p className="text-xs text-slt mb-1">{t.thought.progress}</p>
        <h2 className="text-xl font-bold text-ink mb-1">{t.thought.heading}</h2>
        <p className="text-sm text-slt mb-4">{t.thought.sub}</p>

        <div className="grid grid-cols-1 gap-2 mb-4">
          {THOUGHT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => {
                setField('oldThought', opt.key === 'custom' ? '' : opt.label);
                setField('_thoughtKey', opt.key);
              }}
              className={`text-left px-4 py-3.5 rounded-2xl border text-sm font-medium transition-colors active:scale-[0.98] ${
                form._thoughtKey === opt.key
                  ? 'bg-brand-500/15 border-brand-500 text-brand-400'
                  : 'bg-dark-800 border-dark-600 text-slt'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {form._thoughtKey === 'custom' && (
          <textarea
            className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-ink placeholder-muted focus:outline-none focus:border-brand-500 resize-none mb-4"
            rows={3}
            placeholder={t.thought.customPlaceholder}
            value={form.oldThought}
            onChange={e => setField('oldThought', e.target.value)}
          />
        )}

        <div className="space-y-4 mb-4">
          <div>
            <p className="text-xs font-semibold text-slt mb-2">{t.thought.intensityLabel}</p>
            <div className="flex gap-1.5 flex-wrap">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setField('thoughtIntensityBefore', n)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                    form.thoughtIntensityBefore === n
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-800 border border-dark-600 text-slt'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slt mb-2">{t.thought.confidenceLabel}</p>
            <div className="flex gap-1.5 flex-wrap">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button
                  key={n}
                  onClick={() => setField('confidenceBefore', n)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                    form.confidenceBefore === n
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-800 border border-dark-600 text-slt'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={() => setField('thoughtIntensityBefore', null) || setField('confidenceBefore', null)} className="text-xs text-muted underline">
          {t.thought.skipLink}
        </button>
      </div>
      <div className="px-4 pb-8 pt-2">
        <button
          disabled={!form._thoughtKey || (form._thoughtKey === 'custom' && !form.oldThought.trim())}
          onClick={() => setScreen(5)}
          className="w-full bg-brand-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-40"
        >
          {t.thought.nextBtn}
        </button>
      </div>
    </div>
  );

  // ── SCREEN 5: Generating / Safety / Error ────────────────────────────────
  if (screen === 5) {
    if (safetyFlag === 'needs_support') return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <Header />
        <div className="flex-1 px-4 pt-6 pb-8 flex flex-col">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 mb-6">
            <h2 className="text-lg font-bold text-amber-400 mb-2">{t.safety.heading}</h2>
            <p className="text-sm text-slt leading-relaxed">{t.safety.message}</p>
          </div>
          <div className="mb-6">
            <HelplineList />
          </div>
          <button onClick={() => navigate('/train')} className="w-full bg-dark-700 text-ink font-bold py-3.5 rounded-2xl active:scale-95">
            {t.safety.backBtn}
          </button>
        </div>
      </div>
    );

    if (generateError) return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <Header />
        <div className="flex-1 px-4 flex flex-col items-center justify-center gap-6">
          <p className="text-sm text-slt text-center">{t.error.message}</p>
          <button
            onClick={() => { setGenerateError(false); setScreen(5); }}
            className="bg-brand-500 text-white font-bold py-3 px-8 rounded-2xl active:scale-95"
          >
            {t.error.retryBtn}
          </button>
        </div>
      </div>
    );

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-5 px-4">
        <Loader2 size={40} className="text-brand-400 animate-spin" />
        <p className="text-sm text-slt text-center">{t.generating.text}</p>
        <div className="w-48 h-1 bg-dark-700 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  // ── SCREEN 6: Focus Card ─────────────────────────────────────────────────
  if (screen === 6 && card) {
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header progress="85%" />
      <div className="flex-1 px-4 pt-2 pb-4 overflow-y-auto">
        <p className="text-xs text-slt mb-1">{t.card.progress}</p>
        <h2 className="text-xl font-bold text-ink mb-4">{t.card.heading}</h2>

        <div className="rounded-3xl overflow-hidden mb-4 card-elevated">
          {/* Gradient crown band */}
          <div
            className="px-5 pt-5 pb-4 text-center text-white"
            style={{ background: 'linear-gradient(135deg, #185FA5 0%, #8B5CF6 100%)' }}
          >
            <p className="text-[10px] font-semibold text-white/80 uppercase tracking-widest mb-1">{t.card.focusWordLabel}</p>
            <p className="font-black leading-tight" style={{ fontSize: '30px' }}>{card.focusWord}</p>
          </div>

          <div className="p-5">
            <div className="text-center mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#D98B2B' }}>{t.card.resetWordLabel}</p>
              <p className="font-bold" style={{ fontSize: '22px', color: '#D98B2B' }}>{card.resetWord}</p>
            </div>

            <div className="border-t border-dark-600 pt-4 mb-3">
              <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-1">{t.card.powerLineLabel}</p>
              <p className="text-sm font-semibold text-ink italic">"{card.powerLine}"</p>
            </div>

            <div>
              <p className="text-[10px] font-semibold text-slt uppercase tracking-wider mb-1">{t.card.reminderLabel}</p>
              <p className="text-sm text-slt">{card.performanceReminder}</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800 rounded-2xl p-4 mb-4">
          <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-wider mb-1">{t.card.arjunNoteLabel}</p>
          <p className="text-sm text-slt leading-relaxed">{card.arjunNote}</p>
        </div>

        <p className="text-xs text-muted text-center">{t.card.whenText}</p>

        {maxCardsError && (
          <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-xs text-red-400">{t.maxCards.message} <button onClick={() => navigate('/focus-deck')} className="underline">{t.maxCards.link}</button></p>
          </div>
        )}
      </div>
      <div className="px-4 pb-8 pt-2 space-y-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-gradient w-full py-3.5"
          style={{ minHeight: '52px' }}
        >
          {saving ? <><Loader2 size={16} className="animate-spin" />{t.card.saving}</> : t.card.saveBtn}
        </button>
        <button
          onClick={() => { setCard(null); setScreen(5); }}
          className="w-full bg-dark-700 text-slt font-semibold py-3 rounded-2xl active:scale-95"
        >
          {t.card.regenBtn}
        </button>
        <button
          onClick={() => setScreen(4)}
          className="w-full text-muted text-sm py-2 active:opacity-60"
        >
          {hi ? 'वापस जाओ' : 'Back'}
        </button>
      </div>
    </div>
  );
  } // end screen 6

  // ── SCREEN 7: Saved ──────────────────────────────────────────────────────
  if (screen === 7 && card) return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✦</span>
        </div>
        <h2 className="text-2xl font-bold text-ink mb-2">{t.saved.heading}</h2>
        <p className="text-sm text-slt">{hi ? 'तुम्हारा Focus Card save हो गया।' : 'Your Focus Card is saved.'}</p>
      </div>
      <div className="w-full space-y-3">
        <button
          onClick={handlePractice}
          className="w-full bg-brand-500 text-white font-bold py-3.5 rounded-2xl active:scale-95"
        >
          {t.saved.practiceBtn}
        </button>
        <button
          onClick={() => navigate('/focus-deck')}
          className="w-full bg-dark-700 text-ink font-semibold py-3.5 rounded-2xl active:scale-95"
        >
          {t.saved.deckBtn}
        </button>
      </div>
    </div>
  );

  // ── PRACTICE: Inline 4-step ──────────────────────────────────────────────
  if (screen === 'practice' && card) {
    const steps = [
      { text: t.practice.step1, accent: 'brand' },
      { text: t.practice.step2, accent: 'purple' },
      { text: t.practice.step3, accent: 'brand' },
    ];

    if (practiceDone) return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h2 className="text-xl font-bold text-ink mb-2">{t.practice.doneMsg}</h2>
        </div>
        <button onClick={() => navigate('/focus-deck')} className="w-full bg-brand-500 text-white font-bold py-3.5 rounded-2xl active:scale-95">
          {t.saved.deckBtn}
        </button>
      </div>
    );

    if (practiceStep < 3) {
      const step = steps[practiceStep];
      return (
        <div className="min-h-screen bg-dark-900 flex flex-col">
          <Header />
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
            <div className="flex gap-2 mb-2">
              {[0,1,2,3].map(i => (
                <div key={i} className={`h-1.5 w-12 rounded-full transition-colors ${i <= practiceStep ? 'bg-brand-500' : 'bg-dark-700'}`} />
              ))}
            </div>
            <p className="text-lg font-semibold text-ink leading-snug">{step.text}</p>
            <p className="text-xs text-muted">{hi ? 'स्वचालित रूप से आगे बढ़ रहा है...' : 'Auto-advancing...'}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="flex gap-2 mb-2">
            {[0,1,2,3].map(i => (
              <div key={i} className={`h-1.5 w-12 rounded-full ${i < 3 ? 'bg-brand-500' : 'bg-dark-700'}`} />
            ))}
          </div>
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-3xl p-6 w-full">
            <p className="text-xs font-semibold text-slt uppercase tracking-wider mb-2">{t.practice.step4Label}</p>
            <p className="text-3xl font-black text-ink mb-2">{card.focusWord}</p>
            <p className="text-sm text-slt italic">"{card.powerLine}"</p>
          </div>
          <p className="text-xs text-muted">{hi ? 'जब तैयार हो, टैप करो' : 'Tap when you feel it'}</p>
        </div>
        <div className="px-4 pb-8">
          <button
            onClick={() => setPracticeDone(true)}
            className="w-full bg-brand-500 text-white font-bold py-3.5 rounded-2xl active:scale-95"
          >
            {hi ? 'मैं तैयार हूं ✦' : 'Ready ✦'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
