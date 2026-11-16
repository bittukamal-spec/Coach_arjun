import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ArjunLogo } from '../ArjunLogo';
import { CheckDot } from './SiteBits';

// Shared pieces for Privacy / Terms / Refund (Playbook redesign, Nov 2026).
// Only the look is shared — every page keeps its own legal wording.

export function LegalSection({ title, children, id }) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h2 className="mb-2 text-[17px] font-bold text-ink">{title}</h2>
      <div className="space-y-2.5 text-[14px] leading-relaxed text-slt">{children}</div>
    </section>
  );
}

export function LegalHeader({ backLabel = 'Back' }) {
  const navigate = useNavigate();
  return (
    <header className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        aria-label={backLabel}
        className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => navigate('/')} aria-label="Arjun home" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <ArjunLogo size={28} />
      </button>
      <span className="w-11" aria-hidden="true" />
    </header>
  );
}

export function LegalTitle({ title, updated }) {
  return (
    <div className="mb-5">
      <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-ink">{title}</h1>
      {updated && <p className="mt-1 text-[13px] text-slt">{updated}</p>}
    </div>
  );
}

// The mint "In short" box: a few plain lines with ticks.
export function InShort({ title = 'In short', points }) {
  return (
    <div className="mb-8 rounded-[18px] bg-[#DDF7EE] p-4 text-inkblock" data-testid="legal-in-short">
      <p className="mb-2 text-[14px] font-semibold">{title}</p>
      <ul className="space-y-2">
        {points.map(p => (
          <li key={p} className="flex items-start gap-2 text-[14px] leading-snug">
            <CheckDot className="mt-px h-[18px] w-[18px] shrink-0" tone="mint" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
