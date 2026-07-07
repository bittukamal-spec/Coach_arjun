import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, Target, MessageCircle,
  Dumbbell, Trophy, ListChecks, PenLine, Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';
import { apiFetch } from '../../api';

const SKILL_KEY = 'focus_self_talk';

// ─── Reference implementation for the skill-loop template ──────────────────
// Screen shape: 'intro' → 'example' → 'quiz' → 'pass' | 'fail' → 'useTool' → 'practice'
// Every screen (bar pass/fail, which are brief transitions) carries a small
// "Skip learning for now" link under its main CTA — this is a soft-guidance
// loop, never a hard gate. Future skill paths should follow this same shape:
// intro (concept + benefits + science line) → personalized examples (training
// + competition) → personalized quick check (3 Q, 2/3 to pass) → tool handoff
// → practice handoff.

export default function FocusSelfTalkSkillPath() {
  const { user, token, language } = useAuth();
  const navigate = useNavigate();
  const t = translations[language]?.skillPathFocus || translations.en.skillPathFocus;

  const [screen, setScreen] = useState('intro');
  const [hasActiveFocusCard, setHasActiveFocusCard] = useState(false);

  const [quizIndex, setQuizIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState(null);

  // Check for an existing active Focus Card — decides whether the athlete
  // goes to Build Focus Words or straight to Focus Lock after passing.
  useEffect(() => {
    apiFetch('/api/self-talk/cards?filter=active', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setHasActiveFocusCard(Array.isArray(data) && data.length > 0))
      .catch(() => setHasActiveFocusCard(false));
  }, [token]);

  function goBack() {
    navigate('/train');
  }

  // Leaves the learning loop and hands the athlete straight to the tool —
  // used by the "Skip learning for now" link on intro/example/quiz.
  function skipToTool() {
    navigate('/self-talk');
  }

  function startExample() {
    setScreen('example');
  }

  function startQuiz() {
    apiFetch(`/api/skills/${SKILL_KEY}/learn`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setQuizIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setScreen('quiz');
  }

  function selectAnswer(i) {
    if (selected !== null) return;
    setSelected(i);
    if (i === quizSet[quizIndex].correct) {
      setCorrectCount(c => c + 1);
    }
  }

  function nextQuestion() {
    const isLast = quizIndex === quizSet.length - 1;
    if (!isLast) {
      setQuizIndex(i => i + 1);
      setSelected(null);
      return;
    }
    // correctCount already reflects this question — selectAnswer() updated
    // it synchronously before the Next/See Result button became clickable.
    const passed = correctCount >= 2;
    if (passed) {
      apiFetch(`/api/skills/${SKILL_KEY}/quick-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ passed: true }),
      }).catch(() => {});
      setScreen('pass');
    } else {
      setScreen('fail');
    }
  }

  function retryQuiz() {
    setQuizIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setScreen('quiz');
  }

  function continueFromPass() {
    setScreen(hasActiveFocusCard ? 'practice' : 'useTool');
  }

  // ── Sport-personalized content ───────────────────────────────────────────
  const sportKey = ['football', 'cricket', 'badminton', 'athletics'].includes(user?.sport)
    ? user.sport
    : 'generic';
  const example = t.example[sportKey];
  const quizSet = t.quiz.bySport[sportKey] || t.quiz.bySport.generic;

  // ── Shared bits ───────────────────────────────────────────────────────────
  function Header() {
    return (
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={goBack} className="w-9 h-9 flex items-center justify-center rounded-full bg-dark-700 active:scale-95">
          <ArrowLeft size={18} className="text-ink" />
        </button>
      </div>
    );
  }

  function SkipLink({ onClick }) {
    return (
      <button onClick={onClick} className="w-full text-center text-xs text-muted font-medium mt-3 active:opacity-70">
        {t.skipLearning}
      </button>
    );
  }

  function IconBadge({ icon: Icon, color = '#185FA5', bg = 'rgba(24,95,165,0.12)' }) {
    return (
      <div className="icon-tile" style={{ '--tile-fg': color, '--tile-bg': bg }}>
        <Icon size={22} />
      </div>
    );
  }

  // ── SCREEN: Intro ─────────────────────────────────────────────────────────
  if (screen === 'intro') return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header />
      <div className="flex-1 px-4 pt-2 pb-8 flex flex-col justify-center max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2 mb-5">
          <IconBadge icon={Target} />
          <IconBadge icon={MessageCircle} color="#E2711D" bg="rgba(226,113,29,0.12)" />
        </div>
        <h1 className="text-2xl font-bold text-ink mb-4">{t.intro.title}</h1>
        <div className="space-y-3 mb-6">
          <p className="text-base text-ink leading-relaxed bg-dark-800 border border-dark-600 rounded-2xl p-4">
            {t.intro.line1}
          </p>
          <p className="text-base text-ink leading-relaxed bg-dark-800 border border-dark-600 rounded-2xl p-4">
            {t.intro.line2}
          </p>
        </div>

        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-3">{t.intro.benefitsTitle}</p>
        <div className="space-y-2 mb-6">
          {t.intro.benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-teal-400 shrink-0" />
              <p className="text-sm text-slt leading-snug">{b}</p>
            </div>
          ))}
        </div>

        <div className="bg-dark-800 rounded-2xl p-4">
          <p className="text-xs text-slt leading-relaxed">{t.intro.scienceLine}</p>
        </div>
      </div>
      <div className="px-4 pb-8 max-w-lg mx-auto w-full">
        <button
          onClick={startExample}
          className="btn-gradient w-full py-4 text-base"
          style={{ minHeight: '56px' }}
        >
          {t.intro.cta}
        </button>
        <SkipLink onClick={skipToTool} />
      </div>
    </div>
  );

  // ── SCREEN: Personalized Examples ────────────────────────────────────────
  if (screen === 'example') return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <Header />
      <div className="flex-1 px-4 pt-2 pb-8 max-w-lg mx-auto w-full">
        <p className="text-xs font-bold text-slt uppercase tracking-widest mb-3">{t.example.heading}</p>

        <div className="space-y-3">
          {[
            { data: example.training, label: t.example.trainingLabel, icon: Dumbbell, color: '#2E7D6B', bg: 'rgba(46,125,107,0.12)' },
            { data: example.competition, label: t.example.competitionLabel, icon: Trophy, color: '#E2711D', bg: 'rgba(226,113,29,0.12)' },
          ].map(({ data, label, icon: Icon, color, bg }) => (
            <div key={label} className="bg-dark-800 border border-dark-600 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <IconBadge icon={Icon} color={color} bg={bg} />
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slt uppercase tracking-wide mb-1">{t.example.situationLabel}</p>
                <p className="text-sm text-ink font-semibold leading-relaxed">{data.situation}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">{t.example.unhelpfulLabel}</p>
                <p className="text-sm text-slt">{data.unhelpful}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#185FA5' }}>{t.example.usefulLabel}</p>
                <p className="text-sm text-ink font-medium">{data.useful}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 pb-8 max-w-lg mx-auto w-full">
        <button
          onClick={startQuiz}
          className="btn-gradient w-full py-4 text-base"
          style={{ minHeight: '56px' }}
        >
          {t.example.cta}
        </button>
        <SkipLink onClick={skipToTool} />
      </div>
    </div>
  );

  // ── SCREEN: Quick Check ───────────────────────────────────────────────────
  if (screen === 'quiz') {
    const question = quizSet[quizIndex];
    const isLast = quizIndex === quizSet.length - 1;
    const answered = selected !== null;
    const isCorrect = answered && selected === question.correct;

    return (
      <div className="min-h-screen bg-dark-900 flex flex-col">
        <Header />
        <div className="flex-1 px-4 pt-2 pb-8 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks size={18} className="text-brand-400" />
            <p className="text-xs font-bold text-slt uppercase tracking-widest">
              {t.quiz.progressLabel(quizIndex + 1)}
            </p>
          </div>
          <h2 className="text-lg font-bold text-ink mb-5 leading-snug">{question.q}</h2>

          <div className="space-y-2.5 mb-5">
            {question.options.map((opt, i) => {
              const isSelected = selected === i;
              const showAsCorrect = answered && i === question.correct;
              const showAsWrong = answered && isSelected && i !== question.correct;
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(i)}
                  disabled={answered}
                  className={`w-full text-left px-4 py-3.5 rounded-2xl border text-sm font-medium transition-colors ${
                    showAsCorrect
                      ? 'bg-teal-500/15 border-teal-500/60 text-teal-400'
                      : showAsWrong
                      ? 'bg-red-500/10 border-red-500/40 text-red-400'
                      : 'bg-dark-800 border-dark-600 text-ink'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className={`flex items-start gap-2.5 rounded-2xl p-4 mb-5 ${isCorrect ? 'bg-teal-500/10 border border-teal-500/30' : 'bg-dark-800 border border-dark-600'}`}>
              {isCorrect
                ? <CheckCircle2 size={18} className="text-teal-400 shrink-0 mt-0.5" />
                : <XCircle size={18} className="text-slt shrink-0 mt-0.5" />
              }
              <p className="text-sm text-ink leading-relaxed">
                {isCorrect ? t.quiz.correctFeedback : t.quiz.wrongFeedback}
              </p>
            </div>
          )}
        </div>
        <div className="px-4 pb-8 max-w-lg mx-auto w-full">
          <button
            onClick={nextQuestion}
            disabled={!answered}
            className="btn-gradient w-full py-4 text-base"
            style={{ minHeight: '56px' }}
          >
            {isLast ? t.quiz.seeResultBtn : t.quiz.nextBtn}
          </button>
          <SkipLink onClick={skipToTool} />
        </div>
      </div>
    );
  }

  // ── SCREEN: Pass ──────────────────────────────────────────────────────────
  if (screen === 'pass') return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mb-5">
        <CheckCircle2 size={28} className="text-teal-400" />
      </div>
      <h1 className="text-xl font-bold text-ink mb-2">{t.pass.title}</h1>
      <p className="text-sm text-slt mb-8 max-w-xs">{t.pass.body}</p>
      <button
        onClick={continueFromPass}
        className="btn-gradient w-full max-w-xs py-4 text-base"
        style={{ minHeight: '56px' }}
      >
        {t.pass.cta}
      </button>
    </div>
  );

  // ── SCREEN: Fail ──────────────────────────────────────────────────────────
  if (screen === 'fail') return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-ink mb-2">{t.fail.title}</h1>
      <p className="text-sm text-slt mb-8 max-w-xs">{t.fail.body}</p>
      <button
        onClick={retryQuiz}
        className="btn-gradient w-full max-w-xs py-4 text-base"
        style={{ minHeight: '56px' }}
      >
        {t.fail.cta}
      </button>
    </div>
  );

  // ── SCREEN: Use Tool (Build Focus Words) ─────────────────────────────────
  if (screen === 'useTool') return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 text-center">
      <IconBadge icon={PenLine} />
      <h1 className="text-xl font-bold text-ink mt-4 mb-2">{t.useTool.title}</h1>
      <p className="text-sm text-slt mb-2 max-w-xs">{t.useTool.body}</p>
      <p className="text-xs text-muted mb-8 max-w-xs">{t.useTool.supportLine}</p>
      <button
        onClick={() => navigate('/self-talk')}
        className="btn-gradient w-full max-w-xs py-4 text-base mb-3"
        style={{ minHeight: '56px' }}
      >
        {t.useTool.cta}
      </button>
      <button
        onClick={() => setScreen('practice')}
        className="text-sm text-slt font-medium active:opacity-70"
      >
        {t.useTool.secondary}
      </button>
    </div>
  );

  // ── SCREEN: Practice ──────────────────────────────────────────────────────
  if (screen === 'practice') return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center px-4 text-center">
      <IconBadge icon={Zap} color="#E2711D" bg="rgba(226,113,29,0.12)" />
      <h1 className="text-xl font-bold text-ink mt-4 mb-2">{t.practice.title}</h1>
      <p className="text-sm text-slt mb-2 max-w-xs">{t.practice.body}</p>
      <p className="text-xs text-muted mb-1 max-w-xs">{t.practice.supportLine}</p>
      <p className="text-xs text-muted mb-8 max-w-xs italic">{t.practice.note}</p>
      <button
        onClick={() => navigate('/games/focus-lock')}
        className="btn-gradient w-full max-w-xs py-4 text-base"
        style={{ minHeight: '56px' }}
      >
        {t.practice.cta}
      </button>
      <button
        onClick={goBack}
        className="text-sm text-slt font-medium active:opacity-70 mt-3"
      >
        {t.skipLearning}
      </button>
    </div>
  );

  return null;
}
