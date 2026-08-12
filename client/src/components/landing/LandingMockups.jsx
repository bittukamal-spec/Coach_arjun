import {
  Bookmark, BookOpen, Check, Dumbbell, Home, Layers, MessageCircle, User, Zap,
} from 'lucide-react';
import { ArjunLogo } from '../ArjunLogo';

// Product visuals for the public homepage, drawn in CSS/JSX rather than
// shipped as screenshots so they never drift from a build.
//
// Everything here represents features Arjun actually has today: a Coach
// conversation, a Mental Rep, the Playbook and a Focus Card. There is no
// audio in the product, so there is deliberately no waveform, play control,
// duration bar, microphone or speaker anywhere in these mockups — the only
// "2 min" shown is the length of a Mental Rep, next to a Start label.
// There are also no scores, streaks, XP or charts, because none of those are
// part of what an athlete sees.
//
// Each mockup is decorative: the surrounding copy carries the meaning, so
// callers wrap them in a role="img" container with a text alternative.

const BORDER = 'border-[#E4E9F2]';

function ArjunBubble({ children }) {
  return (
    <p className={`max-w-[86%] rounded-2xl rounded-tl-md bg-[#F3F6FB] border ${BORDER} px-3 py-2 text-[11px] leading-snug text-[#0F172A]`}>
      {children}
    </p>
  );
}

function AthleteBubble({ children }) {
  return (
    <p className="max-w-[86%] self-end rounded-2xl rounded-br-md bg-[#185FA5] px-3 py-2 text-[11px] leading-snug text-white">
      {children}
    </p>
  );
}

// The Mental Rep suggestion an athlete gets at the end of a coaching turn.
function RepCard({ label, title, meta, cta }) {
  return (
    <div className={`rounded-2xl border ${BORDER} bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)]`}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-[#EEF4FC] flex items-center justify-center shrink-0">
          <Zap size={14} className="text-[#185FA5]" />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#5A6B80]">{label}</span>
      </div>
      <p className="mt-2 text-[12px] font-bold text-[#0F172A] leading-snug">{title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-[#5A6B80]">{meta}</span>
        <span className="rounded-full bg-[#185FA5] px-3 py-1 text-[10px] font-bold text-white">{cta}</span>
      </div>
    </div>
  );
}

// The real bottom-nav order of the app: Home · Train · Coach · Playbook · Profile.
const NAV = [
  { Icon: Home, key: 'home' },
  { Icon: Dumbbell, key: 'train' },
  { Icon: MessageCircle, key: 'coach', active: true },
  { Icon: BookOpen, key: 'playbook' },
  { Icon: User, key: 'profile' },
];

function PhoneNav() {
  return (
    <div className={`mt-3 -mx-3 -mb-3 flex items-center justify-around rounded-b-[26px] border-t ${BORDER} bg-[#FAFBFD] px-2 py-2.5`}>
      {NAV.map(({ Icon, key, active }) => (
        <Icon
          key={key}
          size={15}
          strokeWidth={active ? 2.5 : 1.8}
          className={active ? 'text-[#185FA5]' : 'text-[#9AA7B8]'}
        />
      ))}
    </div>
  );
}

// A partly-obscured screen sitting behind the hero phone.
// `align="right"` is what makes the right-hand card readable: only its right
// portion is visible past the phone, so its text has to sit there too.
function BehindCard({ title, Icon, tint, items, align = 'left', className = '' }) {
  return (
    <div className={`rounded-2xl border ${BORDER} bg-white p-3 shadow-[0_6px_20px_rgba(15,23,42,0.07)] ${align === 'right' ? 'text-right' : ''} ${className}`}>
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: tint.bg }}>
          <Icon size={11} style={{ color: tint.fg }} />
        </span>
        <p className="text-[10px] font-bold text-[#0F172A]">{title}</p>
      </div>
      {items.map((item) => (
        <p
          key={item}
          className={`mt-2 rounded-lg border ${BORDER} bg-[#FAFBFD] px-2 py-1.5 text-[9px] leading-snug text-[#5A6B80] ${
            align === 'right' ? 'border-r-2' : 'border-l-2'
          }`}
          style={align === 'right' ? { borderRightColor: tint.fg } : { borderLeftColor: tint.fg }}
        >
          {item}
        </p>
      ))}
    </div>
  );
}

// The layered card that overlaps the phone at every width, so the hero reads
// as a stack of real screens on mobile too — where the two side screens have
// no room to sit.
function FloatingCue({ label, cue }) {
  return (
    <div
      className={`absolute -bottom-3 right-0 w-40 rounded-2xl border ${BORDER} bg-white px-3 py-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.14)] xs:right-2 sm:right-auto sm:left-2 sm:-bottom-5`}
    >
      <div className="flex items-center gap-1.5">
        <Bookmark size={11} className="text-[#13776F]" />
        <span className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#13776F]">{label}</span>
      </div>
      <p className="mt-1 text-[12px] font-bold leading-snug text-[#0F172A]">{cue}</p>
    </div>
  );
}

export function HeroPhone({ t, label }) {
  const p = t.phone;
  return (
    // The behind-cards sit INSIDE this wrapper rather than at negative
    // offsets, so they are partly obscured by the phone instead of being
    // sliced off by the viewport edge on a narrow screen.
    <div role="img" aria-label={label} className="relative mx-auto w-full max-w-[500px]">
      <BehindCard
        title={p.behindPlaybook}
        Icon={BookOpen}
        tint={{ bg: '#EEF4FC', fg: '#185FA5' }}
        items={[p.behindPlaybookItem1, p.behindPlaybookItem2]}
        className="absolute left-0 top-14 hidden w-32 -rotate-[4deg] sm:block"
      />
      <BehindCard
        title={p.behindFocus}
        Icon={Layers}
        tint={{ bg: '#F1EFFD', fg: '#5546C9' }}
        items={[p.behindFocusItem1, p.behindFocusItem2]}
        align="right"
        className="absolute right-0 top-24 hidden w-32 rotate-[4deg] sm:block"
      />

      <div className={`relative mx-auto max-w-[290px] rounded-[30px] border ${BORDER} bg-white p-3 shadow-[0_18px_44px_rgba(15,23,42,0.13)]`}>
        <div className="flex items-center gap-2 px-1 pb-3">
          <ArjunLogo size={22} className="rounded-md" />
          <span className="text-[12px] font-bold text-[#0F172A]">{p.coach}</span>
        </div>

        <div className="flex flex-col gap-2">
          <ArjunBubble>{p.ask}</ArjunBubble>
          <AthleteBubble>{p.athlete}</AthleteBubble>
          <ArjunBubble>{p.reply}</ArjunBubble>
        </div>

        <div className="mt-3">
          <RepCard label={p.repLabel} title={p.repTitle} meta={p.repMeta} cta={p.repCta} />
        </div>

        <PhoneNav />
      </div>

      <FloatingCue label={p.cueLabel} cue={p.cue} />
    </div>
  );
}

// ── App-preview mockups ──────────────────────────────────────────────────────
// Taller than the "How Arjun helps" cards so each one reads as a mini screen.

// `accent` gives each preview its own colour so the carousel reads as four
// different parts of the app rather than four blue cards. Same four-accent
// family as Train: blue, amber, violet, teal.
function PreviewFrame({ Icon, title, line, accent, children }) {
  return (
    <div
      className="flex h-full flex-col rounded-3xl border bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)]"
      style={{ borderColor: `${accent.fg}26` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: accent.fg }}
        >
          <Icon size={16} />
        </span>
        <h3 className="text-[15px] font-bold text-[#0F172A]">{title}</h3>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-[#5A6B80]">{line}</p>
      <div
        className="mt-3 flex-1 rounded-2xl p-3"
        style={{ background: `linear-gradient(160deg, ${accent.bg} 0%, #FAFBFD 72%)` }}
        aria-hidden="true"
      >
        {children}
      </div>
    </div>
  );
}

const PREVIEW_ACCENTS = {
  coach:    { bg: '#E3EEFA', fg: '#185FA5' },
  reps:     { bg: '#FAEBD8', fg: '#9A5410' },
  playbook: { bg: '#E8E4FB', fg: '#5546C9' },
  focus:    { bg: '#DDF0EC', fg: '#13776F' },
};

export function CoachPreview({ t }) {
  return (
    <PreviewFrame Icon={MessageCircle} title={t.title} line={t.line} accent={PREVIEW_ACCENTS.coach}>
      <div className="flex flex-col gap-2">
        <ArjunBubble>{t.ask}</ArjunBubble>
        <AthleteBubble>{t.athlete}</AthleteBubble>
        <ArjunBubble>{t.reply}</ArjunBubble>
      </div>
    </PreviewFrame>
  );
}

export function RepsPreview({ t }) {
  return (
    <PreviewFrame Icon={Zap} title={t.title} line={t.line} accent={PREVIEW_ACCENTS.reps}>
      <p className="text-[12px] font-bold leading-snug text-[#0F172A]">{t.repTitle}</p>
      <ol className="mt-2 space-y-1.5">
        {[t.repStep1, t.repStep2].map((step, i) => (
          <li key={step} className={`flex items-start gap-2 rounded-xl border ${BORDER} bg-white px-2.5 py-2 text-[10.5px] leading-snug text-[#5A6B80]`}>
            <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#EEF4FC] text-[9px] font-bold text-[#185FA5]">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-[#5A6B80]">{t.meta}</span>
        <span className="rounded-full bg-[#185FA5] px-3 py-1 text-[10px] font-bold text-white">{t.cta}</span>
      </div>
    </PreviewFrame>
  );
}

export function PlaybookPreview({ t }) {
  const rows = [
    { label: t.lessonLabel, body: t.lesson, tint: '#EEF4FC', fg: '#185FA5' },
    { label: t.cueLabel, body: t.cue, tint: '#E7F4F2', fg: '#13776F' },
  ];
  return (
    <PreviewFrame Icon={BookOpen} title={t.title} line={t.line} accent={PREVIEW_ACCENTS.playbook}>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className={`rounded-xl border ${BORDER} bg-white p-2.5`}>
            <span
              className="text-[9px] font-bold uppercase tracking-[0.08em]"
              style={{ color: row.fg, background: row.tint, padding: '2px 6px', borderRadius: '999px' }}
            >
              {row.label}
            </span>
            <p className="mt-1.5 text-[11px] leading-snug text-[#0F172A]">{row.body}</p>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

export function FocusCardPreview({ t }) {
  return (
    <PreviewFrame Icon={Layers} title={t.title} line={t.line} accent={PREVIEW_ACCENTS.focus}>
      <div className={`rounded-2xl border ${BORDER} bg-white px-3 py-5 text-center`}>
        <p className="text-[14px] font-black leading-snug text-[#0F172A]">{t.focusWord}</p>
        <span className="mx-auto mt-3 block h-[2px] w-8 rounded-full bg-[#185FA5]" />
        <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.08em] text-[#5A6B80]">{t.reminderLabel}</p>
        <p className="mt-1 text-[10.5px] leading-snug text-[#5A6B80]">{t.reminder}</p>
      </div>
    </PreviewFrame>
  );
}

// ── Personalisation-card visuals ─────────────────────────────────────────────
// Each mirrors a real section of the athlete's Profile — My Game, When
// Pressure Hits (Situation → First response → Performance impact) and What
// Helps Me — using only what the athlete themselves told Arjun. No inferred
// traits, no scoring, no interpretation.

export function GameChips({ chips, fg }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className={`rounded-full border ${BORDER} bg-white px-2.5 py-1 text-[10.5px] font-semibold`}
          style={{ color: fg }}
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

export function PressureFlow({ steps, fg }) {
  return (
    <ol className="space-y-1">
      {steps.map((step, i) => (
        <li key={step} className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: fg, opacity: 1 - i * 0.28 }} />
          <span className={`flex-1 rounded-lg border ${BORDER} bg-white px-2 py-1.5 text-[10.5px] font-semibold text-[#0F172A]`}>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WorksList({ items, fg }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={`flex items-center gap-2 rounded-lg border ${BORDER} bg-white px-2 py-1.5 text-[10.5px] font-semibold text-[#0F172A]`}
        >
          <Check size={12} strokeWidth={3} style={{ color: fg }} className="shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}
