import { useEffect, useRef } from 'react';
import { syncStatusBar } from '../../hooks/useTheme';

// A full-screen page on a feature's own colour (Playbook redesign, founder
// decision Nov 2026): mint = Pressure Reset, sky = Ritual, sun = Quick Rep,
// coral = Focus Cards. The colour comes from the theme-aware
// --tone-*-page tokens (bright in light, deep in dark).
//
// While mounted it claims the phone's status bar (via data-status-bar, which
// useTheme's syncStatusBar honours, so a theme sync can't overwrite it) and
// paints the body behind the page the same colour, so the top of the screen
// and iOS overscroll never show a band of a different colour. Both are
// released on unmount.
const TONE_BG = {
  mint: 'bg-tonepage-mint',
  sky: 'bg-tonepage-sky',
  sun: 'bg-tonepage-sun',
  coral: 'bg-tonepage-coral',
};

export function toneBg(tone) {
  return TONE_BG[tone] || TONE_BG.sky;
}

export default function TonePage({ tone = 'sky', className = '', children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof getComputedStyle !== 'function') return undefined;
    const colour = getComputedStyle(el).backgroundColor;
    if (!colour || colour === 'rgba(0, 0, 0, 0)') return undefined;
    const html = document.documentElement;
    const prevBody = document.body.style.backgroundColor;
    html.dataset.statusBar = colour;
    document.body.style.backgroundColor = colour;
    syncStatusBar();
    return () => {
      delete html.dataset.statusBar;
      document.body.style.backgroundColor = prevBody;
      syncStatusBar();
    };
  }, [tone]);

  return (
    <div ref={ref} className={`min-h-screen ${toneBg(tone)} ${className}`}>
      {children}
    </div>
  );
}
