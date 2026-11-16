import { useEffect, useState } from 'react';

const STORAGE_KEY = 'arjun_theme';

// Fallbacks for the page background if the CSS variable cannot be read
// (e.g. in tests). Keep in step with --bg in index.css.
const PAGE_BG = { light: '#EEF3FF', dark: '#0D1026' };

// Paint the phone's status bar with the page's own background, so the top of
// the screen reads as one surface with no band or edge above the app bar.
// Read from the live --bg token rather than hard-coded, so a palette change
// can never leave the status bar on an old colour again.
function syncStatusBar(isDark) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  meta.content = bg || (isDark ? PAGE_BG.dark : PAGE_BG.light);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || 'system');

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'system') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => syncStatusBar(theme === 'dark' || (theme === 'system' && media.matches));
    apply();

    // Following the phone's setting: repaint when it switches light/dark.
    if (theme !== 'system') return undefined;
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [theme]);

  return { theme, setTheme };
}
