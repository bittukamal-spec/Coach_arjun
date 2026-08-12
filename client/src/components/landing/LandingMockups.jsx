import { Check } from 'lucide-react';
import {
  CoachScreen, MentalRepScreen, PhoneFrame, PlaybookScreen, PressureScreen,
} from './PhoneFrame';

// Product visuals for the public homepage.
//
// Every app screen is drawn inside a realistic phone frame, in the app's REAL
// dark theme (see PhoneFrame.jsx) — the marketing page stays white, but what
// sits inside a device is what an athlete actually sees. Nothing is a
// screenshot, so none of it can drift from a build.
//
// Everything shown exists today: a Coach conversation, a Mental Rep, the
// Playbook and the When Pressure Hits section of the Profile. There is no
// audio in the product, so no waveform, play control, duration bar,
// microphone or speaker appears anywhere — and no scores, streaks, XP or
// progress graphs, because an athlete never sees those either.
//
// Each mockup is decorative: the surrounding copy carries the meaning, so
// callers wrap them in a role="img" container with a text alternative.

// ── Hero ────────────────────────────────────────────────────────────────────
// The hero deliberately shows Arjun ASKING and CHECKING — the real loop is
// question → question → "does that fit?" → only then a Mental Rep. It stops
// before any prescription so the page doesn't promise an instant fix.
export function HeroPhone({ t, label }) {
  const p = t.phone;
  return (
    <div role="img" aria-label={label} className="relative mx-auto w-full max-w-[264px]">
      <PhoneFrame>
        <CoachScreen
          t={p}
          turns={[
            ['arjun', p.q1],
            ['athlete', p.a1],
            ['arjun', p.q2],
            ['athlete', p.a2],
            ['arjun', p.q3],
          ]}
        />
      </PhoneFrame>
    </div>
  );
}

// ── Inside Arjun ────────────────────────────────────────────────────────────
// One frame per screen, identical proportions, with the section label and one
// line sitting OUTSIDE the device so the device stays a clean app screen.
function Preview({ title, line, children }) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="text-[15px] font-bold text-[#0F172A]">{title}</h3>
      <p className="mt-1 text-[12.5px] leading-snug text-[#5A6B80]">{line}</p>
      <div className="mt-3.5" aria-hidden="true">
        <PhoneFrame className="mx-auto w-full max-w-[224px]" screenClassName="min-h-[352px]">
          {children}
        </PhoneFrame>
      </div>
    </div>
  );
}

export function CoachPreview({ t }) {
  return (
    <Preview title={t.title} line={t.line}>
      <CoachScreen
        t={t}
        chips={false}
        turns={[
          ['arjun', t.q1],
          ['athlete', t.a1],
          ['arjun', t.q2],
          ['athlete', t.a2],
        ]}
      />
    </Preview>
  );
}

export function RepsPreview({ t }) {
  return (
    <Preview title={t.title} line={t.line}>
      <MentalRepScreen t={t} />
    </Preview>
  );
}

export function PlaybookPreview({ t }) {
  return (
    <Preview title={t.title} line={t.line}>
      <PlaybookScreen t={t} />
    </Preview>
  );
}

export function ProfilePreview({ t }) {
  return (
    <Preview title={t.title} line={t.line}>
      <PressureScreen t={t} />
    </Preview>
  );
}

// ── Built-around-you card visuals ───────────────────────────────────────────
// Each mirrors a real Profile section — My Game, When Pressure Hits
// (Situation → First response → Performance impact) and What Helps Me — using
// only what the athlete told Arjun themselves. No inferred traits, no scoring.

export function GameChips({ chips, fg }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-[#E4E9F2] bg-white px-2.5 py-1 text-[10.5px] font-semibold"
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
          <span className="flex-1 rounded-lg border border-[#E4E9F2] bg-white px-2 py-1.5 text-[10.5px] font-semibold text-[#0F172A]">
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
          className="flex items-center gap-2 rounded-lg border border-[#E4E9F2] bg-white px-2 py-1.5 text-[10.5px] font-semibold text-[#0F172A]"
        >
          <Check size={12} strokeWidth={3} style={{ color: fg }} className="shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}
