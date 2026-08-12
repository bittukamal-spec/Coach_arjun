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
//
// SIZING. The device is a real 390×844 box (`aspect-[390/844]`), so it stays
// narrow and tall at every width, and the caller sets only its width. The
// DEVICE is the CSS container; the screen inside reads its base font-size
// from it (`3.95cqw` — about 8.3px on a 216px device), and every size inside
// is written in `em`. So the whole UI scales with the device like a
// scaled-down screenshot rather than a page reflowing into a small box. The
// Tailwind `text-[9px]` on the screen is the fallback for engines without
// container query units.

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

// The device itself: 390/844 proportions, thin bezel, brushed outer rim,
// small speaker cutout, soft ground shadow and a suggestion of side buttons.
export function PhoneFrame({ children, className = '', style }) {
  return (
    <div className={`relative ${className}`} style={style}>
      {/* side buttons — a hint of hardware, not a drawing of a product */}
      <span
        aria-hidden="true"
        className="absolute left-[-1.5px] top-[22%] h-[7%] w-[2px] rounded-l-sm"
        style={{ background: 'linear-gradient(180deg,#3A4450,#232A33)' }}
      />
      <span
        aria-hidden="true"
        className="absolute left-[-1.5px] top-[33%] h-[10%] w-[2px] rounded-l-sm"
        style={{ background: 'linear-gradient(180deg,#3A4450,#232A33)' }}
      />
      <span
        aria-hidden="true"
        className="absolute right-[-1.5px] top-[28%] h-[12%] w-[2px] rounded-r-sm"
        style={{ background: 'linear-gradient(180deg,#3A4450,#232A33)' }}
      />

      {/* `containerType` sits on the DEVICE, and the screen's base font-size is
          read from it — a container cannot size itself, so these must be two
          different elements. Everything inside the screen is in `em`, so the
          whole UI scales with the device exactly like a scaled screenshot. */}
      <div
        className="relative aspect-[390/844] w-full rounded-[13%/6%] p-[1.6%] shadow-[0_18px_38px_-12px_rgba(9,20,35,0.42)]"
        style={{
          background: 'linear-gradient(150deg,#2C333C 0%,#12171D 34%,#0A0E13 100%)',
          containerType: 'inline-size',
        }}
      >
        <div
          className="relative flex h-full w-full flex-col overflow-hidden rounded-[11.5%/5.3%] text-[9px]"
          style={{ background: DARK.bg, fontSize: '3.95cqw' }}
        >
          {/* speaker / island */}
          <div className="flex shrink-0 justify-center pt-[0.7em]">
            <span className="h-[1.15em] w-[4.6em] rounded-full bg-black" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// Coach header — the real one is an on-dark bar with the Arjun mark.
function ScreenHeader({ title }) {
  return (
    <div className="flex shrink-0 items-center gap-[0.5em] px-[1em] pb-[0.7em] pt-[0.6em]" style={{ borderBottom: `1px solid ${DARK.line}` }}>
      <span className="flex h-[1.5em] w-[1.5em] items-center justify-center rounded-[0.4em]" style={{ background: DARK.accent }}>
        <MessageCircle className="h-[0.9em] w-[0.9em]" style={{ color: DARK.bg }} />
      </span>
      <span className="text-[1.05em] font-bold leading-none" style={{ color: DARK.ink }}>{title}</span>
    </div>
  );
}

// The real Coach renders Arjun as plain text (no bubble) and the athlete as a
// tinted bubble on --surface-selected. Reproduced exactly.
function ArjunTurn({ children }) {
  return <p className="text-[1em] leading-snug" style={{ color: DARK.ink }}>{children}</p>;
}

function AthleteTurn({ children }) {
  return (
    <p
      className="ml-auto max-w-[82%] rounded-[1.1em] rounded-br-[0.35em] px-[0.7em] py-[0.45em] text-[1em] leading-snug"
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
      className="mt-auto flex shrink-0 items-center justify-around px-[0.6em] py-[0.7em]"
      style={{ background: DARK.bg, borderTop: `1px solid ${DARK.line}` }}
    >
      {NAV.map((Icon, i) => (
        <Icon
          key={i}
          className="h-[1.35em] w-[1.35em]"
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
      {/* A real chat sits at the BOTTOM of the screen, above the nav — the
          turns and their reply chips push down together rather than floating
          under the header. */}
      <div className="mt-auto">
        <div className="flex flex-col gap-[0.7em] px-[1em] py-[0.9em]">
          {turns.map(([who, text]) => (
            who === 'arjun'
              ? <ArjunTurn key={text}>{text}</ArjunTurn>
              : <AthleteTurn key={text}>{text}</AthleteTurn>
          ))}
        </div>
        {chips && (
          <div className="flex gap-[0.5em] px-[1em] pb-[0.9em]">
            {[t.chipYes, t.chipNo].map((chip) => (
              <span
                key={chip}
                className="rounded-full px-[0.9em] py-[0.45em] text-[0.95em] font-semibold leading-none"
                style={{ border: `1px solid ${DARK.line}`, color: DARK.sub, background: DARK.card }}
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      <PhoneNav />
    </>
  );
}

// ── Screen 2: Mental Rep ────────────────────────────────────────────────────
export function MentalRepScreen({ t }) {
  return (
    <>
      <ScreenHeader title={t.title} />
      <div className="flex-1 px-[1em] py-[0.9em]">
        <div className="flex items-center gap-[0.5em]">
          <span className="flex h-[1.7em] w-[1.7em] items-center justify-center rounded-[0.5em]" style={{ background: 'rgba(95,168,222,0.16)' }}>
            <Zap className="h-[0.95em] w-[0.95em]" style={{ color: DARK.accent }} />
          </span>
          <span className="text-[0.85em] font-bold uppercase tracking-[0.1em] leading-none" style={{ color: DARK.dim }}>{t.meta}</span>
        </div>
        <p className="mt-[0.7em] text-[1.2em] font-bold leading-snug" style={{ color: DARK.ink }}>{t.repTitle}</p>
        <ol className="mt-[0.9em] space-y-[0.45em]">
          {[t.step1, t.step2, t.step3].map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-[0.5em] rounded-[0.8em] px-[0.7em] py-[0.55em] text-[0.95em] leading-snug"
              style={{ background: DARK.card, border: `1px solid ${DARK.line}`, color: DARK.sub }}
            >
              <span
                className="flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-full text-[0.8em] font-bold"
                style={{ background: 'rgba(95,168,222,0.16)', color: DARK.accent }}
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <span
          className="mt-[1.1em] flex w-full items-center justify-center rounded-[0.8em] py-[0.7em] text-[1em] font-bold"
          style={{ background: DARK.accent, color: DARK.bg }}
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
      <div className="flex-1 space-y-[0.6em] px-[1em] py-[0.9em]">
        <div className="rounded-[0.8em] p-[0.7em]" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
          <span className="text-[0.8em] font-bold uppercase tracking-[0.1em]" style={{ color: DARK.accent }}>
            {t.lessonLabel}
          </span>
          <p className="mt-[0.5em] text-[1em] leading-snug" style={{ color: DARK.ink }}>{t.lesson}</p>
        </div>
        <div className="rounded-[0.8em] p-[0.7em]" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
          <span className="flex items-center gap-[0.4em] text-[0.8em] font-bold uppercase tracking-[0.1em]" style={{ color: '#22D3C5' }}>
            <Bookmark className="h-[1em] w-[1em]" /> {t.cueLabel}
          </span>
          <p className="mt-[0.5em] text-[1.1em] font-bold leading-snug" style={{ color: DARK.ink }}>{t.cue}</p>
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
      <div className="flex-1 space-y-[0.5em] px-[1em] py-[0.9em]">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-[0.8em] p-[0.7em]" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
            <p className="text-[0.8em] font-bold uppercase tracking-[0.1em]" style={{ color: DARK.dim }}>{label}</p>
            <p className="mt-[0.35em] text-[1em] leading-snug" style={{ color: DARK.ink }}>{value}</p>
          </div>
        ))}
        <p
          className="rounded-full px-[0.9em] py-[0.5em] text-center text-[0.85em] font-semibold"
          style={{ background: 'rgba(95,168,222,0.12)', color: DARK.accent }}
        >
          {t.resetTime}
        </p>
      </div>
      <PhoneNav active={4} />
    </>
  );
}
