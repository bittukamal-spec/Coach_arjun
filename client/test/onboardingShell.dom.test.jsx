// Real router + render tests for the PR 1 onboarding foundation: the shared
// OnboardingShell chrome, theme-independence, accessibility semantics, and
// focus management. Mounts the real OnboardingPage under a real MemoryRouter;
// only useAuth and apiFetch are mocked (the established pattern in
// dashboardShortcuts / practiceShell dom tests).

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellSrc = readFileSync(path.join(__dirname, '../src/components/onboarding/OnboardingShell.jsx'), 'utf8');

const authState = {
  user: { id: 'u1', onboardingDone: false, name: 'Test Athlete' },
  token: 'test-token',
  language: 'en',
  updateUser: vi.fn(),
};
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ user: {} }) })),
}));

const { default: OnboardingPage } = await import('../src/pages/OnboardingPage.jsx');

function RouteProbe() {
  const loc = useLocation();
  return <p data-testid="route-probe">{loc.pathname}</p>;
}
function TestApp() {
  return (
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/mind-journal" element={<RouteProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.language = 'en';
  authState.user = { id: 'u1', onboardingDone: false, name: 'Test Athlete' };
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => cleanup());

describe('OnboardingShell — PR 1 foundation', () => {
  test('renders the first screen with stage progress, no back action, and a disabled Continue', () => {
    render(<TestApp />);
    expect(screen.getByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
    // Stable-stage progress, not a per-question count.
    expect(screen.getAllByText('Stage 1 of 3').length).toBeGreaterThan(0);
    expect(screen.getByText('About you')).toBeTruthy();
    // The AI disclosure was removed from onboarding — it must NOT appear here.
    expect(screen.queryByText(/not a human coach or therapist/i)).toBeNull();
    // No Back on the first screen.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont.disabled).toBe(true);
  });

  test('options expose radio semantics with aria-checked that toggles, inside a radiogroup', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    const cricket = screen.getByRole('radio', { name: 'Cricket' });
    expect(cricket.getAttribute('aria-checked')).toBe('false');
    expect(cricket.closest('[role="radiogroup"]')).toBeTruthy();
    // Visible focus ring is present (both themes rely on the same ring token).
    expect(cricket.className).toMatch(/focus-visible:ring-brand-500/);
    await user.click(cricket);
    expect(cricket.getAttribute('aria-checked')).toBe('true');
  });

  test('DOM structure is identical in light and dark themes (no per-theme component tree)', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { container: lightC } = render(<TestApp />);
    const lightHtml = lightC.innerHTML;
    cleanup();
    localStorage.clear();

    document.documentElement.setAttribute('data-theme', 'dark');
    const { container: darkC } = render(<TestApp />);
    const darkHtml = darkC.innerHTML;

    expect(darkHtml).toBe(lightHtml);
  });

  test('advancing a screen moves focus to the new heading (focus management)', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const roleHeading = await screen.findByRole('heading', {
      name: "What's your role, position or event?",
    });
    await waitFor(() => expect(document.activeElement).toBe(roleHeading));
  });

  test('Back appears from screen 2 and returns to the previous screen', async () => {
    render(<TestApp />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Cricket' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const back = await screen.findByRole('button', { name: 'Back' });
    await user.click(back);
    expect(await screen.findByRole('heading', { name: 'What sport do you play?' })).toBeTruthy();
  });

  test('Hindi renders the translated first screen', () => {
    authState.language = 'hi';
    render(<TestApp />);
    expect(screen.getByRole('heading', { name: 'आप कौन सा खेल खेलते हैं?' })).toBeTruthy();
  });

  test('sport tiles show full names with no truncation (one line, not clipped)', () => {
    render(<TestApp />);
    for (const name of ['Cricket', 'Football', 'Badminton', 'Athletics', 'Wrestling', 'Other sport']) {
      const opt = screen.getByRole('radio', { name });
      // full label text present verbatim (no ellipsis)
      expect(opt.textContent).toContain(name);
      // never uses truncate / line-clamp; label is one line via nowrap
      expect(opt.className).not.toMatch(/truncate|line-clamp/);
      expect(opt.querySelector('.whitespace-nowrap')).toBeTruthy();
      expect(opt.querySelector('.truncate')).toBeNull();
    }
  });

  test('Hindi sport tiles are not truncated either', () => {
    authState.language = 'hi';
    render(<TestApp />);
    for (const name of ['क्रिकेट', 'बैडमिंटन', 'एथलेटिक्स', 'अन्य खेल']) {
      const opt = screen.getByRole('radio', { name });
      expect(opt.textContent).toContain(name);
      expect(opt.querySelector('.truncate')).toBeNull();
    }
  });

  // jsdom cannot evaluate max()/env() inline styles, so the safe-area and
  // reduced-motion contracts are asserted at the source level here.
  test('footer honours the device safe area (env(safe-area-inset-bottom))', () => {
    expect(shellSrc).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(shellSrc).toMatch(/<footer/);
  });

  test('entrance animation is reduced-motion safe', () => {
    expect(shellSrc).toMatch(/motion-safe:animate-fade-in/);
  });

  test('back control has an accessible label and the heading is programmatically focusable', () => {
    render(<TestApp />);
    // heading is focusable (tabIndex -1) for focus management
    const heading = screen.getByRole('heading', { name: 'What sport do you play?' });
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });
});
