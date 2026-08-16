// Rendered behaviour of the follow-up Contact & Support entry points:
// homepage 3-dot menu, auth support link (both tabs), and the Account page's
// Contact & Support row. One shared mock for useAuth/apiFetch (mutated per
// test) since Vitest hoists vi.mock to the top of the file — same technique
// as performanceCheckin.dom.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = {
  user: null,
  token: null,
  language: 'en',
  toggleLanguage: vi.fn(),
  loginWithUser: vi.fn(),
  logout: vi.fn(),
  updateUser: vi.fn(),
  avatarUrl: null,
  updateAvatar: vi.fn(),
};

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('../src/api', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ achievements: [] }) })),
}));

const { default: LandingPage } = await import('../src/pages/LandingPage.jsx');
const { default: AuthPage } = await import('../src/pages/AuthPage.jsx');
const { default: AccountPage } = await import('../src/pages/AccountPage.jsx');

function resetAuthState() {
  authState.user = null;
  authState.token = null;
  authState.language = 'en';
  authState.toggleLanguage.mockClear();
  authState.loginWithUser.mockClear();
  authState.logout.mockClear();
}

beforeEach(() => resetAuthState());
afterEach(() => cleanup());

// ── Homepage 3-dot menu ──────────────────────────────────────────────────

describe('homepage 3-dot menu', () => {
  function renderHome() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/contact" element={<p>CONTACT</p>} />
          <Route path="/privacy" element={<p>PRIVACY</p>} />
          <Route path="/terms" element={<p>TERMS</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  test('opening the menu shows a Contact & Support item', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: 'Contact & Support' })).toBeTruthy();
  });

  test('the menu item routes to /contact', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: 'Contact & Support' }));
    expect(await screen.findByText('CONTACT')).toBeTruthy();
  });

  test('other menu items (Sign in, Privacy, Terms) still work alongside it', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const menu = document.getElementById('landing-menu');
    expect(within(menu).getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Privacy' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Terms' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Contact & Support' })).toBeTruthy();
  });

  test('the Hindi menu shows the translated Contact & Support label', async () => {
    authState.language = 'hi';
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /मेन्यू/i }));
    expect(screen.getByRole('button', { name: 'संपर्क और सहायता' })).toBeTruthy();
  });
});

// ── Auth page support link ──────────────────────────────────────────────

describe('auth page support link', () => {
  function renderAuth(initialPath = '/auth') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/contact" element={<p>CONTACT</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  test('sign-up state (default tab) shows "Need help? Contact support"', () => {
    renderAuth('/auth');
    expect(screen.getByText('Need help?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contact support' })).toBeTruthy();
  });

  test('sign-in state also shows the support link', () => {
    renderAuth('/auth?tab=signin');
    expect(screen.getByText('Need help?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contact support' })).toBeTruthy();
  });

  test('the support link routes to /contact without touching auth state', async () => {
    const user = userEvent.setup();
    renderAuth('/auth');
    await user.click(screen.getByRole('button', { name: 'Contact support' }));
    expect(await screen.findByText('CONTACT')).toBeTruthy();
    expect(authState.loginWithUser).not.toHaveBeenCalled();
  });

  test('the Hindi auth page shows the translated support link', () => {
    authState.language = 'hi';
    renderAuth('/auth');
    expect(screen.getByText('मदद चाहिए?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'सहायता से संपर्क करें' })).toBeTruthy();
  });
});

// ── Account page Contact & Support row ──────────────────────────────────

describe('account page contact & support row', () => {
  beforeEach(() => {
    authState.user = {
      id: 'u1', name: 'Rahul', email: 'rahul@example.com', tier: 'trial',
      trialStarted: new Date().toISOString(), createdAt: new Date().toISOString(), goals: [],
    };
    authState.token = 't';
  });

  function renderAccount() {
    return render(
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/contact" element={<p>CONTACT</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  test('shows a Contact & Support row and no raw personal email', async () => {
    renderAccount();
    const row = await screen.findByRole('button', { name: /Contact & Support/ });
    expect(row).toBeTruthy();
    expect(screen.queryByText('kamal.prabhanshu@outlook.com')).toBeNull();
    expect(screen.queryByText(/@outlook\.com/)).toBeNull();
  });

  test('the row navigates to /contact when activated', async () => {
    const user = userEvent.setup();
    renderAccount();
    const row = await screen.findByRole('button', { name: /Contact & Support/ });
    await user.click(row);
    expect(await screen.findByText('CONTACT')).toBeTruthy();
  });

  test('Sign Out is still present and unaffected', async () => {
    renderAccount();
    await screen.findByRole('button', { name: /Contact & Support/ });
    expect(screen.getByText('Sign Out')).toBeTruthy();
  });
});
