import { useEffect } from 'react';
import { syncStatusBar } from '../../hooks/useTheme';

// A full-screen page on a feature's own colour (Playbook redesign, founder
// decision Nov 2026): mint = Pressure Reset, sky = Ritual, sun = Quick Rep,
// coral = Focus Cards, blush = Mind Journal. The colour comes from the
// theme-aware --tone-*-page tokens (bright in light, deep in dark; coral and
// blush pages are lighter than their blocks so grey text stays readable).

const TONE_BG = {
  mint: 'bg-tonepage-mint',
  sky: 'bg-tonepage-sky',
  sun: 'bg-tonepage-sun',
  coral: 'bg-tonepage-coral',
  blush: 'bg-tonepage-blush',
};

export function toneBg(tone) {
  return TONE_BG[tone] || TONE_BG.sky;
}

// While a feature page is on screen, claim the phone's status bar for its
// colour (via data-status-bar on <html>, which useTheme's syncStatusBar
// honours so a theme sync can't overwrite it) and paint the body behind the
// page the same colour, so the top of the screen and iOS overscroll never
// show a band of a different colour. Both are released on unmount.
// Use it directly in pages with many screens that each set `bg-tonepage-*`.
export function useToneStatusBar(tone) {
  useStatusBarColour(tone ? { tone } : null);
}

// Same claim for a fixed colour (e.g. a dark photo page): pass { colour: '#101533' },
// or a theme-aware CSS variable: { cssVar: '--site-top' }.
export function useStatusBarColour(spec) {
  const tone = spec?.tone;
  const fixed = spec?.colour;
  const cssVar = spec?.cssVar;
  useEffect(() => {
    if ((!tone && !fixed && !cssVar) || typeof getComputedStyle !== 'function') return undefined;
    const html = document.documentElement;
    const colour = fixed || getComputedStyle(html).getPropertyValue(cssVar || `--tone-${tone}-page`).trim();
    if (!colour) return undefined;
    const prevBody = document.body.style.backgroundColor;
    html.dataset.statusBar = colour;
    document.body.style.backgroundColor = colour;
    syncStatusBar();
    return () => {
      delete html.dataset.statusBar;
      document.body.style.backgroundColor = prevBody;
      syncStatusBar();
    };
  }, [tone, fixed, cssVar]);
}

export default function TonePage({ tone = 'sky', className = '', children }) {
  useToneStatusBar(tone);
  return (
    <div className={`min-h-screen ${toneBg(tone)} ${className}`}>
      {children}
    </div>
  );
}
