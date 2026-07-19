import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Zap, Wind, Target, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api';
import GradientIconTile from '../components/train/GradientIconTile';
import { PracticeIntro, PracticeScreen, PracticeCompletion } from '../components/practice/PracticeShell';

// ─── Quick Rep (Daily Mental Rep) — the core Healthy Hook habit ────────────
// Flow: intro → context → state → moment → short guided rep → one cue →
// save → exit. Entirely rule-based (no AI call): finite, fast, and always
// ends by sending the athlete back to real training. Saving posts one
// ToolReport via POST /api/mental-rep/complete. Intro/practice/completion
// chrome comes from the shared PracticeShell (Stage 6); the wizard logic
// and data below are unchanged from before that migration.

const CONTEXTS = [
  { id: 'training', en: 'Training today',  hi: 'आज ट्रेनिंग है' },
  { id: 'match',    en: 'Match today',     hi: 'आज मैच है' },
  { id: 'recovery', en: 'Recovery day',    hi: 'आराम का दिन' },
  { id: 'just_rep', en: 'Just a rep',      hi: 'बस एक रेप' },
];

const STATES = [
  { id: 'distracted',   en: 'Distracted',   hi: 'ध्यान भटका हुआ' },
  { id: 'nervous',      en: 'Nervous',      hi: 'घबराया हुआ' },
  { id: 'flat',         en: 'Flat',         hi: 'सुस्त / फ्लैट' },
  { id: 'ready',        en: 'Ready',        hi: 'तैयार' },
  { id: 'frustrated',   en: 'Frustrated',   hi: 'निराश / गुस्सा' },
  { id: 'overthinking', en: 'Overthinking', hi: 'ओवरथिंकिंग' },
];

const MOMENTS = [
  { id: 'first_minutes',   en: 'First few minutes',     hi: 'शुरुआती मिनट' },
  { id: 'after_mistake',   en: 'After a mistake',       hi: 'गलती के बाद' },
  { id: 'pressure_moment', en: 'Pressure moment',       hi: 'दबाव वाला पल' },
  { id: 'coach_watching',  en: 'Coach watching',        hi: 'कोच देख रहा है' },
  { id: 'selection_trial', en: 'Selection / trial',     hi: 'सिलेक्शन / ट्रायल' },
  { id: 'end_of_session',  en: 'End of match/session',  hi: 'मैच/सेशन का अंत' },
  { id: 'own',             en: 'Write my own',          hi: 'खुद लिखूंगा' },
];

// Per-state micro-rep: one focused interaction, never a long journal.
const REP_STEPS = {
  nervous: {
    interaction: 'breath',
    title:   { en: 'Slow your body first.', hi: 'पहले शरीर को धीमा करो।' },
    sub:     { en: '3 slow breaths. Make the exhale longer than the inhale. Tap after each breath.', hi: '3 धीमी सांसें। सांस छोड़ना, लेने से लंबा रखो। हर सांस के बाद टैप करो।' },
  },
  distracted: {
    interaction: 'chips',
    title:   { en: 'Pick ONE thing to lock onto.', hi: 'एक चीज़ चुनो जिस पर लॉक करना है।' },
    sub:     { en: 'For your first minute, your eyes stay on this.', hi: 'पहले मिनट में तुम्हारी नज़र इसी पर रहेगी।' },
    choices: [
      { en: 'The ball',        hi: 'बॉल' },
      { en: 'Your position',   hi: 'अपनी पोजीशन' },
      { en: 'Your first touch', hi: 'अपना पहला टच' },
      { en: 'Your opponent',   hi: 'अपना opponent' },
    ],
  },
  frustrated: {
    interaction: 'chips',
    title:   { en: 'Name it. Then leave it.', hi: 'उसे नाम दो। फिर छोड़ दो।' },
    sub:     { en: 'One tap for what happened. The next action is what counts now.', hi: 'जो हुआ उसके लिए एक टैप। अब जो मायने रखता है वो है अगला एक्शन।' },
    choices: [
      { en: 'Bad pass / shot', hi: 'खराब पास / शॉट' },
      { en: 'Missed chance',   hi: 'मौका छूट गया' },
      { en: 'Lost focus',      hi: 'फोकस खो गया' },
      { en: 'Bad session',     hi: 'खराब सेशन' },
    ],
  },
  flat: {
    interaction: 'chips',
    title:   { en: 'Low energy is a signal, not a verdict.', hi: 'कम एनर्जी एक संकेत है, फैसला नहीं।' },
    sub:     { en: 'Pick one thing to attack first.', hi: 'एक चीज़ चुनो जिस पर पहले अटैक करना है।' },
    choices: [
      { en: 'First rep',    hi: 'पहला रेप' },
      { en: 'First sprint', hi: 'पहली स्प्रिंट' },
      { en: 'First touch',  hi: 'पहला टच' },
      { en: 'Warm-up pace', hi: 'वार्म-अप की रफ्तार' },
    ],
  },
  overthinking: {
    interaction: 'chips',
    title:   { en: 'You control one thing at a time.', hi: 'एक समय पर तुम एक ही चीज़ कंट्रोल करते हो।' },
    sub:     { en: 'Pick yours for today.', hi: 'आज के लिए अपनी चीज़ चुनो।' },
    choices: [
      { en: 'Effort',        hi: 'मेहनत' },
      { en: 'First action',  hi: 'पहला एक्शन' },
      { en: 'Body language', hi: 'बॉडी लैंग्वेज' },
      { en: 'Breathing',     hi: 'सांस' },
    ],
  },
  ready: {
    interaction: 'chips',
    title:   { en: 'Good. Now sharpen it.', hi: 'बढ़िया। अब इसे और तेज़ करो।' },
    sub:     { en: "What's your first action going to be?", hi: 'तुम्हारा पहला एक्शन क्या होगा?' },
    choices: [
      { en: 'Strong start',  hi: 'दमदार शुरुआत' },
      { en: 'First touch',   hi: 'पहला टच' },
      { en: 'First rep',     hi: 'पहला रेप' },
      { en: 'Call it loud',  hi: 'ज़ोर से कॉल करो' },
    ],
  },
};

// Cue options by state — short performance words an athlete can actually say
// mid-game. Sport flavour prepends one sport-specific cue when known.
const CUE_BANK = {
  nervous:      ['One breath, next action', 'Settle, then go', 'Slow exhale, strong start'],
  distracted:   ['Early eyes', 'One target', 'Watch, then move'],
  frustrated:   ['Next play', 'Reset, go again', 'One breath, move on'],
  flat:         ['Attack the first rep', 'Fast feet now', 'Bring it'],
  overthinking: ['Just this action', 'One job now', 'See it, do it'],
  ready:        ['Strong start', 'First rep sharp', 'Lock in'],
};

const SPORT_CUES = {
  cricket:   { nervous: 'One breath, next ball', frustrated: 'Next ball', distracted: 'Watch the ball' },
  football:  { frustrated: 'Next pass, head up', distracted: 'Scan early' },
  badminton: { frustrated: 'Next point', flat: 'Move early' },
  athletics: { frustrated: 'Next rep', ready: 'Drive, stay tall' },
};

export default function MentalRepPage() {
  const { user, token, language } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hi = language === 'hi';

  // Dashboard's context picker can pre-answer step 1.
  const preContext = CONTEXTS.some(c => c.id === location.state?.context) ? location.state.context : null;

  const [step, setStep]           = useState('intro');
  const [context, setContext]     = useState(preContext);
  const [athleteState, setAthleteState] = useState(null);
  const [moment, setMoment]       = useState(null);
  const [momentText, setMomentText] = useState('');
  const [breaths, setBreaths]     = useState(0);
  const [cue, setCue]             = useState(null);
  const [customCue, setCustomCue] = useState('');
  const [saving, setSaving]       = useState(false);

  const sportKey = (user?.sport || '').toLowerCase();

  function goBack() {
    const order = ['intro', 'context', 'state', 'moment', 'rep', 'cue', 'save'];
    const idx = order.indexOf(step);
    if (step === 'done') return; // exit screen has its own single way out
    if (idx <= 0) { navigate('/dashboard'); return; }
    // Context was pre-answered by Dashboard's context picker, so 'context'
    // was skipped on the way in — back from 'state' returns to 'intro',
    // not to a screen that was never shown this session.
    if (step === 'state' && preContext) { setStep('intro'); return; }
    setStep(order[idx - 1]);
  }

  function cueOptions() {
    const base = [...(CUE_BANK[athleteState] || CUE_BANK.ready)];
    const sportCue = SPORT_CUES[sportKey]?.[athleteState];
    if (sportCue && !base.includes(sportCue)) base.unshift(sportCue);
    return base.slice(0, 4);
  }

  async function finishRep(saveCue) {
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch('/api/mental-rep/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ context, state: athleteState, moment, momentText: momentText || undefined, cue, saveCue }),
      });
    } catch { /* the rep still counts for the athlete — show the exit screen */ }
    setSaving(false);
    setStep('done');
  }

  // ── Shared bits ────────────────────────────────────────────────────────────
  const headerTitle = hi ? 'आज का मेंटल रेप' : "Today's Mental Rep";

  const Screen = ({ title, sub, children }) => (
    <PracticeScreen onBack={goBack} headerTitle={headerTitle} title={title} sub={sub}>
      {children}
    </PracticeScreen>
  );

  const ChoiceButton = ({ label, onClick, selected = false }) => (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 rounded-2xl border text-sm font-medium transition-colors active:scale-[0.99] ${
        selected ? 'bg-brand-500/15 border-brand-500/60 text-brand-400' : 'bg-dark-800 border-dark-600 text-ink'
      }`}
      style={{ minHeight: '48px' }}
    >
      {label}
    </button>
  );

  // ── STEP: Intro ────────────────────────────────────────────────────────────
  if (step === 'intro') return (
    <PracticeIntro
      onBack={goBack}
      headerTitle={headerTitle}
      icon={Zap}
      variant="blue"
      tag={hi ? '4 मिनट' : '4 min'}
      title="Quick Rep"
      desc={hi
        ? '4 मिनट में मन तैयार करो और एक cue लेकर निकलो।'
        : 'A 4-minute rep that ends with one cue you take to training.'}
      whyLabel={hi ? 'यह क्यों काम करता है' : 'Why this works'}
      whyBody={hi
        ? 'अपनी स्थिति को पहचानना और एक साफ फोकस पॉइंट चुनना ध्यान को उस चीज़ पर लाता है जिसे तुम अभी नियंत्रित कर सकते हो — यही "process focus" तकनीक स्पोर्ट्स साइकोलॉजिस्ट दबाव के पलों से पहले इस्तेमाल करवाते हैं। एक छोटा बोला गया cue लेकर खत्म करने से उसे उस पल में याद रखना आसान हो जाता है।'
        : 'Naming your state and picking one clear focus point narrows your attention onto what you can control right now — the same "process focus" technique sports psychologists use before high-pressure moments. Ending with one short, spoken cue makes it easy to recall in the moment.'}
      onStart={() => setStep(preContext ? 'state' : 'context')}
      startLabel={hi ? 'शुरू करो' : 'Start'}
    />
  );

  // ── STEP: Context ──────────────────────────────────────────────────────────
  if (step === 'context') return (
    <Screen title={hi ? 'किसकी तैयारी कर रहे हो?' : 'What are you preparing for?'}>
      <div className="space-y-2.5">
        {CONTEXTS.map(c => (
          <ChoiceButton key={c.id} label={hi ? c.hi : c.en} onClick={() => { setContext(c.id); setStep('state'); }} />
        ))}
      </div>
    </Screen>
  );

  // ── STEP: State ────────────────────────────────────────────────────────────
  if (step === 'state') return (
    <Screen title={hi ? 'अभी तुम्हारा मन कैसा है?' : 'How is your mind right now?'}>
      <div className="grid grid-cols-2 gap-2.5">
        {STATES.map(s => (
          <ChoiceButton key={s.id} label={hi ? s.hi : s.en} onClick={() => { setAthleteState(s.id); setBreaths(0); setStep('moment'); }} />
        ))}
      </div>
    </Screen>
  );

  // ── STEP: Moment ───────────────────────────────────────────────────────────
  if (step === 'moment') return (
    <Screen title={hi ? 'कौन सा पल बेहतर संभालना है?' : 'What moment do you want to handle better?'}>
      <div className="space-y-2.5">
        {MOMENTS.map(m => (
          <ChoiceButton
            key={m.id}
            label={hi ? m.hi : m.en}
            selected={moment === m.id}
            onClick={() => {
              setMoment(m.id);
              if (m.id !== 'own') setStep('rep');
            }}
          />
        ))}
        {moment === 'own' && (
          <div className="pt-1">
            <input
              value={momentText}
              onChange={e => setMomentText(e.target.value.slice(0, 120))}
              placeholder={hi ? 'जैसे: पहली गेंद पर बोलिंग' : 'e.g. bowling the first over'}
              className="input-field"
              autoFocus
            />
            <button
              onClick={() => momentText.trim() && setStep('rep')}
              disabled={!momentText.trim()}
              className="btn-gradient w-full py-3 text-sm mt-2.5 disabled:opacity-40"
              style={{ minHeight: '48px' }}
            >
              {hi ? 'आगे बढ़ो' : 'Continue'}
            </button>
          </div>
        )}
      </div>
    </Screen>
  );

  // ── STEP: Rep (per-state micro interaction) ────────────────────────────────
  if (step === 'rep') {
    const rep = REP_STEPS[athleteState] || REP_STEPS.ready;

    if (rep.interaction === 'breath') {
      return (
        <Screen title={hi ? rep.title.hi : rep.title.en} sub={hi ? rep.sub.hi : rep.sub.en}>
          <div className="flex flex-col items-center pt-6">
            <GradientIconTile icon={Wind} variant="teal" size={30} className="w-20 h-20 rounded-3xl mb-6" />
            <p className="text-sm text-slt mb-6">{hi ? `सांस ${breaths}/3` : `Breath ${breaths} of 3`}</p>
            <button
              onClick={() => {
                const next = breaths + 1;
                setBreaths(next);
                if (next >= 3) setStep('cue');
              }}
              className="btn-gradient w-full max-w-xs py-4 text-base"
              style={{ minHeight: '56px' }}
            >
              {breaths === 0 ? (hi ? 'सांस शुरू करो' : 'Start breathing') : (hi ? 'सांस पूरी हुई' : 'Breath done')}
            </button>
          </div>
        </Screen>
      );
    }

    return (
      <Screen title={hi ? rep.title.hi : rep.title.en} sub={hi ? rep.sub.hi : rep.sub.en}>
        <div className="space-y-2.5">
          {rep.choices.map((c, i) => (
            <ChoiceButton key={i} label={hi ? c.hi : c.en} onClick={() => setStep('cue')} />
          ))}
        </div>
      </Screen>
    );
  }

  // ── STEP: Cue ──────────────────────────────────────────────────────────────
  if (step === 'cue') return (
    <Screen
      title={hi ? 'अपना cue चुनो।' : 'Pick your cue.'}
      sub={hi ? 'छोटे शब्द जो तुम खेल के बीच खुद से कह सको।' : 'Short words you can actually say mid-game.'}
    >
      <div className="space-y-2.5 mb-4">
        {cueOptions().map(c => (
          <ChoiceButton key={c} label={`"${c}"`} selected={cue === c} onClick={() => { setCue(c); setStep('save'); }} />
        ))}
      </div>
      <p className="text-xs font-bold text-slt uppercase tracking-widest mb-2">{hi ? 'या खुद लिखो' : 'Or write your own'}</p>
      <input
        value={customCue}
        onChange={e => setCustomCue(e.target.value.slice(0, 40))}
        placeholder={hi ? 'जैसे: अगली गेंद' : 'e.g. Next ball'}
        className="input-field"
      />
      <button
        onClick={() => { const c = customCue.trim(); if (c) { setCue(c); setStep('save'); } }}
        disabled={!customCue.trim()}
        className="btn-gradient w-full py-3 text-sm mt-2.5 disabled:opacity-40"
        style={{ minHeight: '48px' }}
      >
        {hi ? 'यह मेरा cue है' : 'Use this cue'}
      </button>
    </Screen>
  );

  // ── STEP: Save ─────────────────────────────────────────────────────────────
  if (step === 'save') return (
    <PracticeCompletion>
      <GradientIconTile icon={Target} variant="blue" size={26} className="mb-5" />
      <p className="text-xs font-bold text-slt uppercase tracking-widest mb-2">{hi ? 'तुम्हारा cue' : 'Your cue'}</p>
      <p className="text-3xl font-black text-ink mb-8">"{cue}"</p>
      <p className="text-sm text-slt mb-6 max-w-xs">{hi ? 'इसे अपने Playbook में save करें?' : 'Save this to your Playbook?'}</p>
      <button
        onClick={() => finishRep(true)}
        disabled={saving}
        className="btn-gradient w-full max-w-xs py-4 text-base mb-3 disabled:opacity-60"
        style={{ minHeight: '56px' }}
      >
        {hi ? 'Cue save करो' : 'Save cue'}
      </button>
      <button
        onClick={() => finishRep(false)}
        disabled={saving}
        className="text-sm text-slt font-medium active:opacity-70 disabled:opacity-40"
      >
        {hi ? 'अभी नहीं' : 'Not now'}
      </button>
    </PracticeCompletion>
  );

  // ── STEP: Exit ─────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <PracticeCompletion>
      <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mb-5">
        <CheckCircle2 size={28} className="text-teal-400" />
      </div>
      <h1 className="text-xl font-bold text-ink mb-6">{hi ? 'रेप पूरा।' : 'Rep complete.'}</h1>
      <p className="text-xs font-bold text-slt uppercase tracking-widest mb-2">{hi ? 'आज का cue' : "Today's cue"}</p>
      <p className="text-3xl font-black mb-8" style={{ color: '#185FA5' }}>"{cue}"</p>
      <p className="text-sm text-slt mb-10 max-w-xs leading-relaxed">
        {context === 'match'
          ? (hi ? 'इसे मैच में लेकर जाओ। फोन रखो और खेलने चलो।' : 'Take this into the match. Put the phone away and go play.')
          : (hi ? 'इसे ट्रेनिंग में लेकर जाओ। फोन रखो और काम पर लगो।' : 'Take this into training. Put the phone away and get to work.')}
      </p>
      <button
        onClick={() => navigate('/dashboard')}
        className="btn-gradient w-full max-w-xs py-4 text-base"
        style={{ minHeight: '56px' }}
      >
        <Zap size={18} />
        {hi ? 'हो गया' : 'Done'}
      </button>
    </PracticeCompletion>
  );

  return null;
}
