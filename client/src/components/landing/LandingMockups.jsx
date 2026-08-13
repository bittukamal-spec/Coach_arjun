import { Bookmark, Check, Gauge, MessageCircle, Zap } from 'lucide-react';
import { CoachScreen, DARK, PhoneFrame } from './PhoneFrame';

// Product visuals for the public homepage.
//
// The app UI is used as HERO GRAPHIC, not as four identical screenshots in
// four identical boxes. The hero is a real device; inside the "Inside Arjun"
// carousel each story gets its own composition — a cropped device, an
// enlarged Mental Rep card, offset Playbook cards, a blown-up pressure flow —
// so the section reads editorial rather than like a product-shot grid.
//
// Everything shown exists today: a Coach conversation, a Mental Rep, the
// Playbook and the When Pressure Hits section of the Profile, all in the
// app's REAL dark tokens (see PhoneFrame.jsx). There is no audio in the
// product, so no waveform, play control, duration bar, microphone or speaker
// appears anywhere — and no scores, streaks, XP or progress graphs, because
// an athlete never sees those either.
//
// Each mockup is decorative: the surrounding copy carries the meaning, so
// callers wrap them in a role="img" container with a text alternative.

// ── Hero ────────────────────────────────────────────────────────────────────
// The hero deliberately shows Arjun ASKING and CHECKING — the real loop is
// question → question → "does that fit?" → only then a Mental Rep. It stops
// before any prescription so the page doesn't promise an instant fix.
//
// The device is presented large (≈76% of the content column on mobile) and
// sits on a pale-blue panel, so it reads as a product visual rather than a
// small illustration floating in white space.
export function HeroPhone({ t, label }) {
  const p = t.phone;
  return (
    <div role="img" aria-label={label} className="relative">
      {/* Pale support panel, bleeding past the page gutter so it reads as a
          band behind the product rather than a box around it. */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-5 bottom-0 top-6 rounded-[2.5rem] lg:-inset-x-2 lg:top-0"
        style={{ background: 'linear-gradient(165deg,#DCE9F8 0%,#EAF2FB 48%,#F7FAFD 100%)' }}
      />
      <div
        aria-hidden="true"
        className="absolute -right-1 top-2 h-28 w-28 rounded-full border-[12px] border-white/60 lg:right-4"
      />
      {/* dotted grid, bottom-right, as in the approved mockup */}
      <div
        aria-hidden="true"
        className="absolute -right-2 bottom-6 h-24 w-28 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(#B9CFEA 1.4px, transparent 1.4px)',
          backgroundSize: '10px 10px',
        }}
      />
      {/* The device is deliberately CROPPED at the bottom: the visible screen
          is the conversation, and the phone runs off the panel like a product
          shot rather than sitting whole in a box. */}
      <div className="relative mx-auto aspect-[390/470] overflow-hidden pt-7" style={{ width: 'clamp(268px, 92vw, 372px)' }}>
        <PhoneFrame className="mx-auto rotate-[-4deg]" style={{ width: 'clamp(232px, 76vw, 300px)' }}>
          <CoachScreen
            t={p}
            anchor="top"
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
    </div>
  );
}

// ── Inside Arjun ────────────────────────────────────────────────────────────
// One shared shell: title + one line, then an art area whose composition is
// different for every story. `tint` is the story's accent; `artClass` sets the
// art height so the four cards are not the same block repeated.
function Story({ title, line, tint, Icon, artClass = 'h-[240px]', children }) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-3xl border"
      style={{ background: tint.bg, borderColor: `${tint.fg}26` }}
    >
      {/* Copy sits at the top of the card; the product UI fills the lower part
          and is cropped by the card edge. */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: tint.fg }}
            aria-hidden="true"
          >
            <Icon size={16} />
          </span>
          <h3 className="text-[15px] font-bold leading-tight text-[#0F172A]">{title}</h3>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-[#5A6B80]">{line}</p>
      </div>
      <div className={`relative ${artClass}`} aria-hidden="true">{children}</div>
    </div>
  );
}

const TINTS = {
  blue: { bg: '#E7F0FB', fg: '#185FA5' },
  teal: { bg: '#DDF0EC', fg: '#13776F' },
  amber: { bg: '#FAEBD8', fg: '#9A5410' },
  violet: { bg: '#EAE6FC', fg: '#5546C9' },
};

// 1 — Coach: a real device, cropped by the card so the screen runs off the
// bottom edge instead of sitting politely inside a box.
export function CoachPreview({ t }) {
  return (
    <Story title={t.title} line={t.line} tint={TINTS.blue} Icon={MessageCircle} artClass="h-[196px]">
      <div className="absolute left-1/2 top-0 w-[78%] -translate-x-1/2">
        <PhoneFrame>
          <CoachScreen
            t={t}
            chips={false}
            anchor="top"
            turns={[
              ['arjun', t.q1],
              ['athlete', t.a1],
              ['arjun', t.q2],
              ['athlete', t.a2],
            ]}
          />
        </PhoneFrame>
      </div>
    </Story>
  );
}

// 2 — Mental Rep: no device at all. The rep card itself, enlarged, tilted and
// running past the right edge of the card.
export function RepsPreview({ t }) {
  return (
    <Story title={t.title} line={t.line} tint={TINTS.teal} Icon={Zap} artClass="h-[248px]">
      <div
        className="absolute -right-4 top-0 w-[88%] rotate-[-2deg] rounded-3xl p-4 shadow-[0_18px_40px_-16px_rgba(9,20,35,0.55)]"
        style={{ background: DARK.bg, border: `1px solid ${DARK.line}` }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={{ background: 'rgba(95,168,222,0.16)' }}>
            <Zap size={14} style={{ color: DARK.accent }} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: DARK.dim }}>{t.meta}</span>
        </div>
        <p className="mt-2.5 text-[17px] font-bold leading-tight" style={{ color: DARK.ink }}>{t.repTitle}</p>
        <ol className="mt-3 space-y-1.5">
          {[t.step1, t.step2, t.step3].map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11.5px]"
              style={{ background: DARK.card, border: `1px solid ${DARK.line}`, color: DARK.sub }}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{ background: 'rgba(95,168,222,0.16)', color: DARK.accent }}
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <span
          className="mt-3.5 flex w-full items-center justify-center rounded-xl py-2.5 text-[12px] font-bold"
          style={{ background: DARK.accent, color: DARK.bg }}
        >
          {t.cta}
        </span>
      </div>
    </Story>
  );
}

// 3 — Playbook: the two saved items, enlarged and offset from each other, the
// lower one overhanging the card edge.
export function PlaybookPreview({ t }) {
  return (
    <Story title={t.title} line={t.line} tint={TINTS.amber} Icon={Bookmark} artClass="h-[232px]">
      <div
        className="absolute left-4 top-1 w-[84%] rotate-[-2deg] rounded-2xl p-3.5 shadow-[0_16px_34px_-16px_rgba(9,20,35,0.5)]"
        style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}
      >
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: DARK.accent }}>
          {t.lessonLabel}
        </span>
        <p className="mt-1.5 text-[13px] leading-snug" style={{ color: DARK.ink }}>{t.lesson}</p>
      </div>
      <div
        className="absolute -right-4 bottom-2 w-[74%] rotate-[3deg] rounded-2xl p-3.5 shadow-[0_18px_38px_-14px_rgba(9,20,35,0.55)]"
        style={{ background: DARK.bg, border: `1px solid ${DARK.line}` }}
      >
        <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: '#22D3C5' }}>
          <Bookmark size={11} /> {t.cueLabel}
        </span>
        <p className="mt-1.5 text-[19px] font-black leading-none" style={{ color: DARK.ink }}>{t.cue}</p>
      </div>
    </Story>
  );
}

// 4 — When Pressure Hits: the Profile's own three-step structure, blown up
// into a flow with connectors. No scoring, no graph — the athlete's own words.
export function ProfilePreview({ t }) {
  const rows = [
    [t.situationLabel, t.situation],
    [t.firstResponseLabel, t.firstResponse],
    [t.impactLabel, t.impact],
  ];
  return (
    <Story title={t.title} line={t.line} tint={TINTS.violet} Icon={Gauge} artClass="h-[254px]">
      <div
        className="absolute inset-x-4 top-0 rounded-3xl p-3.5 shadow-[0_18px_40px_-18px_rgba(9,20,35,0.5)]"
        style={{ background: DARK.bg, border: `1px solid ${DARK.line}` }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: 'rgba(95,168,222,0.16)' }}>
            <Gauge size={12} style={{ color: DARK.accent }} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: DARK.ink }}>{t.screenTitle}</span>
        </div>
        <ol className="mt-3 space-y-0">
          {rows.map(([label, value], i) => (
            <li key={label}>
              <div className="rounded-xl px-3 py-2" style={{ background: DARK.card, border: `1px solid ${DARK.line}` }}>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: DARK.dim }}>{label}</p>
                <p className="mt-0.5 text-[12px] leading-snug" style={{ color: DARK.ink }}>{value}</p>
              </div>
              {i < rows.length - 1 && (
                <span className="mx-auto block h-3 w-[2px]" style={{ background: 'rgba(95,168,222,0.45)' }} />
              )}
            </li>
          ))}
        </ol>
        <p
          className="mt-3 rounded-full px-3 py-1.5 text-center text-[10px] font-semibold"
          style={{ background: 'rgba(95,168,222,0.12)', color: DARK.accent }}
        >
          {t.resetTime}
        </p>
      </div>
    </Story>
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
          className="rounded-full bg-white/85 px-3 py-1.5 text-[11.5px] font-bold shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
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
        <li key={step} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: fg, opacity: 1 - i * 0.28 }} />
          <span className="flex-1 rounded-xl bg-white/85 px-2.5 py-1.5 text-[11.5px] font-bold text-[#0F172A] shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
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
          className="flex items-center gap-2 rounded-xl bg-white/85 px-2.5 py-1.5 text-[11.5px] font-bold text-[#0F172A] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
        >
          <Check size={13} strokeWidth={3} style={{ color: fg }} className="shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}
