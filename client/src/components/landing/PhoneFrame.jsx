import { BookOpen, Bookmark, Dumbbell, Home, MessageCircle, User, Zap } from 'lucide-react';

// Realistic phone frames for the public homepage, with the app's REAL dark
// theme inside them. The site itself stays white; only what sits inside a
// device frame is dark, because that is what an athlete actually sees in the
// app. Values below are the app's own dark tokens (index.css), hard-coded
// here so the marketing page can render them without switching theme:
//
//   #07131F  page/--bg          #132334  card/--card
//   #1B3044  --card-muted / --surface-selected (athlete bubble)
//   #1F3448  --border-soft / hairline
//   #F8FAFC  --text-1           #AAB7C4  --text-2      #7E8A99  --text-3
//   #5FA8DE  --brand-on-dark / --nav-fg-active
//
// Nothing here shows audio, a waveform, a microphone, a score, a streak or a
// progress graph — none of those exist in the product.

export const DARK = {
  bg: '#07131F',
  card: '#132334',
  muted: '#1B3044',
  line: '#1F3448',
  ink: '#F8FAFC',
  sub: '#AAB7C4',
  dim: '#7E8A99',
  accent: '#5FA8DE',
};

// The device itself: narrow phone proportions, black bezel, dynamic-island
// cutout, soft outer shadow. `w` lets a caller size the hero phone slightly
// larger than the carousel phones while keeping identical proportions.
export function PhoneFrame({ children, className = '', screenClassName = '' }) {
  return (
    <div
      className={`relative rounded-[2.4rem] bg-[#0A0F16] p-[7px] shadow-[0_26px_60px_rgba(9,20,35,0.34)] ring-1 ring-black/20 ${className}`}
    >
      <div
        className={`relative flex flex-col overflow-hidden rounded-[2rem] ${screenClassName}`}
        style={{ background: DARK.bg }}
      >
        {/* dynamic island */}
        <div className="flex justify-center pt-2">
          <span className="h-[16px] w-[64px] rounded-full bg-black" />
        </div>
        {children}
      </div>
    </div>
  );
}

// Coach header — the real one is an on-dark bar with the Arjun mark.
function ScreenHeader({ title }) {
  return (
    <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-2" style={{ borderBottom: `1px solid ${DARK.line}` }}>
      <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: DARK.accent }}>
        <MessageCircle size={11} className="text-[#07131F]" />
      </span>
      <span className="text-[11px] font-bold" style={{ color: DARK.ink }}>{title}</span>
    </div>
  );
}

// The real Coach renders Arjun as plain text (no bubble) and the athlete as a
// tinted bubble on --surface-selected. Reproduced exactly.
function ArjunTurn({ children }) {
  return <p className="text-[10.5px] leading-snug" style={{ color: DARK.ink }}>{children}</p>;
}

function AthleteTurn({ children }) {
  return (
    <p
      className="ml-auto max-w-[82%] rounded-2xl rounded-br-md px-2.5 py-1.5 text-[10.5px] leading-snug"
      style={{ background: DARK.muted, border: `1px solid ${DARK.line}`, color: DARK.ink }}
    >
      {children}
    </p>
  );
}

const NAV = [Home, Dumbbell, MessageCircle, BookOpen, User];

function PhoneNav({ active = 2 }) {
  return (
    <div
      className="mt-auto flex items-center justify-around px-2 py-2.5"
      style={{ background: '#07131F', borderTop: `1px solid ${DARK.line}` }}
    >
      {NAV.map((Icon, i) => (
        <Icon
          key={i}
          size={13}
          strokeWidth={i === active ? 2.5 : 1.8}
          style={{ color: i === active ? DARK.accent : '#5A6B7C' }}
        />
      ))}
    </div>
  );
}

// ── Screen 1: Coach ─────────────────────────────────────────────────────────
// Arjun asks focused questions and checks its understanding BEFORE any Mental
// Rep is suggested — that is the real coaching loop, so that is what the hero
// shows. The Yes / Not quite replies are the real confirmation chips.
export function CoachScreen({ t, turns, chips = true }) {
  return (
    <>
      <ScreenHeader title={t.coach || 'Arjun'} />
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        {turns.map(([who, text]) => (
          who === 'arjun'
            ? <ArjunTurn key={text}>{text}</ArjunTurn>
            : <AthleteTurn key={text}>{text}</AthleteTurn>
        ))}
      </div>
      {chips && (
        <div className="flex gap-2 px-3.5 pb-3">
          {[t.chipYes, t.chipNo].map((chip) => (
            <span
              key={chip}
              className="rounded-full px-3 py-1.5 text-[10px] font-semibold"
              style={{ border: `1px solid ${DARK.line}`, color: DARK.sub, background: DARK.card }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
      <PhoneNav />
    </>
  );
}

// ── Screen 2: Mental Rep ────────────────────────────────────────────────────
export function MentalRepScreen({ t }) {
  return (
    <>
      <ScreenHeader title={t.title} />
      <div className="flex-1 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: 'rgba(95,168,222,0.16)' }}>
            <Zap size={12} style={{ color: DARK.accent }} />
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: DARK.dim }}>{t.meta}</span>
        </div>
        <p className="mt-2 text-[13px] font-bold leading-snug" style={{ color: DARK.ink }}>{t.repTitle}</p>
        <ol className="mt-3 space-y-1.5">
          {[t.step1, t.step2, t.step3].map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[10.5px]"
              style={{ background: DARK.card, border: `1px solid ${DARK.line}`, color: DARK.sub }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8.5px] font-bold"
                style={{ background: 'rgba(95,168,222,0.16)', color: DARK.accent }}
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <span
          className="mt-4 flex w-full items-center justify-center rounded-xl py-2.5 text-[11px] font-bold"
          style={{ background: DARK.accent, color: '#07131F' }}
        >
          {t.cta}
        </span>
      </div>
      <PhoneNav active={1} />
    </>
  );
}

// ── Screen 3: Playbook ──────────────────────────────────────────────────────
export function PlaybookScreen({ t }) {
  return (
    <>
      <ScreenHeader title={t.title} />
      <div className="flex-1 space-y-2.5 px-3.5 py-3">
        <div className="rounded-xl p-2.5" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
          <span className="text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: DARK.accent }}>
            {t.lessonLabel}
          </span>
          <p className="mt-1.5 text-[11px] leading-snug" style={{ color: DARK.ink }}>{t.lesson}</p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
          <span className="flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#22D3C5' }}>
            <Bookmark size={10} /> {t.cueLabel}
          </span>
          <p className="mt-1.5 text-[12px] font-bold leading-snug" style={{ color: DARK.ink }}>{t.cue}</p>
        </div>
      </div>
      <PhoneNav active={3} />
    </>
  );
}

// ── Screen 4: When Pressure Hits (Profile) ──────────────────────────────────
// The real Profile contract: Situation → First response → Performance impact,
// plus reset time. Athlete-provided answers only — no scoring, no graph.
export function PressureScreen({ t }) {
  const rows = [
    [t.situationLabel, t.situation],
    [t.firstResponseLabel, t.firstResponse],
    [t.impactLabel, t.impact],
  ];
  return (
    <>
      <ScreenHeader title={t.screenTitle} />
      <div className="flex-1 space-y-2 px-3.5 py-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl p-2.5" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
            <p className="text-[8.5px] font-bold uppercase tracking-[0.1em]" style={{ color: DARK.dim }}>{label}</p>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: DARK.ink }}>{value}</p>
          </div>
        ))}
        <p
          className="rounded-full px-3 py-1.5 text-center text-[9.5px] font-semibold"
          style={{ background: 'rgba(95,168,222,0.12)', color: DARK.accent }}
        >
          {t.resetTime}
        </p>
      </div>
      <PhoneNav active={4} />
    </>
  );
}
