import { useState } from 'react';

// Small shared pieces for the public website pages.

// A photo with a drawn fallback: the founder drops the real stock photos in
// client/public/photos/ (hero.jpg, cta.jpg). Until a file exists — or if it
// fails to load — a flat sport-neutral drawing shows instead, so the page
// never has a broken image.
export function PhotoSlot({ src, alt, className = '', tone = 'blue' }) {
  const [failed, setFailed] = useState(false);
  const bg = tone === 'sun' ? 'bg-[#E0A800]' : 'bg-brand-200';
  return (
    <span className={`block overflow-hidden ${bg} ${className}`}>
      {!failed ? (
        <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <svg role="img" aria-label={alt} viewBox="0 0 230 300" preserveAspectRatio="xMidYMax meet" className="h-full w-full">
          <circle cx="115" cy="300" r="120" fill={tone === 'sun' ? '#FFC629' : '#3A66FF'} />
          <circle cx="115" cy="118" r="34" fill="#FFFFFF" />
          <path d="M60 300c0-70 24-118 55-118s55 48 55 118z" fill="#FFFFFF" />
          <circle cx="180" cy="70" r="16" fill="#FF6B4A" />
          <path d="M28 200c14-8 24-18 30-30" fill="none" stroke="#9DB4FF" strokeWidth="5" strokeLinecap="round" strokeDasharray="3 11" />
        </svg>
      )}
    </span>
  );
}

// A filled tick in a circle. tone: mint (on light mint), sun (on blue),
// plain (blue tick, no circle), blue (white tick on brand blue).
export function CheckDot({ className = 'w-5 h-5', tone = 'blue', label }) {
  const fills = { mint: ['#7FE3C4', '#0E5A45'], sun: ['#FFC629', '#101533'], blue: ['#1B4DFF', '#FFFFFF'], soft: ['#DCE5FF', '#1B4DFF'] };
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' };
  if (tone === 'plain') {
    return (
      <svg viewBox="0 0 24 24" className={className} {...a11y}>
        <path d="M5 12l5 5 9-10" fill="none" stroke="#1B4DFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const [bg, fg] = fills[tone] || fills.blue;
  return (
    <svg viewBox="0 0 24 24" className={className} {...a11y}>
      <circle cx="12" cy="12" r="11" fill={bg} />
      <path d="M7 12l3.5 3.5L17 9" fill="none" stroke={fg} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
