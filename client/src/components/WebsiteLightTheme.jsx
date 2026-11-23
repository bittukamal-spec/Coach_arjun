import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { syncStatusBar } from '../hooks/useTheme';

// The public website is always light (founder, Nov 2026): the app's
// Light / Dark / Auto choice belongs to the app only, so choosing Dark and
// signing out must not turn the website dark. On these paths <html> is forced
// to data-theme="light"; leaving them puts back the athlete's own choice.
export const WEBSITE_PATHS = [
  '/', '/auth', '/premium', '/plans', '/privacy', '/terms', '/refund',
  '/contact', '/forgot-password', '/reset-password', '/guardian-consent',
];

function restoreAppTheme() {
  const html = document.documentElement;
  let saved = 'system';
  try { saved = localStorage.getItem('arjun_theme') || 'system'; } catch { /* storage blocked */ }
  if (saved === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', saved);
  syncStatusBar();
}

export default function WebsiteLightTheme() {
  const { pathname } = useLocation();
  const isWebsite = WEBSITE_PATHS.includes(pathname);

  useEffect(() => {
    if (!isWebsite) return undefined;
    document.documentElement.setAttribute('data-theme', 'light');
    syncStatusBar(false);
    return restoreAppTheme;
  }, [isWebsite]);

  return null;
}
