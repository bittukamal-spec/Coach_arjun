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
        <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" />
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

// Drawing for the website's final yellow section: an athlete's phone with
// Arjun's chat, a "helped" tick and sport shapes around it — the app itself,
// no stock photo needed.
export function FinalArt({ label, className = '' }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" className={className}>
      <rect x="0" y="0" width="320" height="180" rx="22" fill="#FFE08A" />
      <circle cx="160" cy="200" r="120" fill="#FFC629" />
      {/* track lines */}
      <path d="M0 150 Q160 110 320 150" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="6 10" opacity=".8" />
      {/* phone */}
      <rect x="118" y="22" width="84" height="150" rx="16" fill="#101533" />
      <rect x="123" y="27" width="74" height="140" rx="12" fill="#EEF3FF" />
      <rect x="148" y="31" width="24" height="6" rx="3" fill="#101533" />
      <rect x="130" y="46" width="44" height="14" rx="7" fill="#FFFFFF" />
      <rect x="146" y="66" width="44" height="14" rx="7" fill="#1B4DFF" />
      <rect x="130" y="86" width="50" height="14" rx="7" fill="#FFFFFF" />
      <rect x="130" y="108" width="60" height="30" rx="9" fill="#FFC629" />
      <rect x="137" y="115" width="30" height="5" rx="2.5" fill="#101533" />
      <rect x="137" y="125" width="18" height="7" rx="3.5" fill="#101533" />
      {/* Arjun mark */}
      <rect x="208" y="26" width="34" height="34" rx="9" fill="#1B4DFF" />
      <path d="M219 33c13 0 13 20 0 20" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M213 43h20" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M231 40l4 3-4 3z" fill="#FFFFFF" />
      {/* helped tick */}
      <circle cx="90" cy="60" r="20" fill="#7FE3C4" />
      <path d="M81 60l6 6 12-12" fill="none" stroke="#101533" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* ball + cone + stopwatch */}
      <circle cx="60" cy="128" r="16" fill="#FF6B4A" />
      <path d="M48 120c8 2 14 8 16 20" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M252 150l12-34 12 34z" fill="#FF6B4A" />
      <rect x="249" y="148" width="30" height="6" rx="3" fill="#101533" />
      <circle cx="268" cy="88" r="15" fill="#FFFFFF" />
      <circle cx="268" cy="88" r="11" fill="none" stroke="#101533" strokeWidth="2.4" />
      <path d="M268 88v-6M268 88l4 3" stroke="#101533" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="264" y="70" width="8" height="4" rx="2" fill="#101533" />
      {/* sparkles */}
      <path d="M40 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFFFFF" />
      <path d="M290 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#1B4DFF" />
    </svg>
  );
}
