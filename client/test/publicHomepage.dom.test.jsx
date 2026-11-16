// Rendered behaviour of the public website (Playbook redesign, Nov 2026):
// the main action opens sign-up, sign-in stays in the header, no prices on
// the home page, the Premium box opens /premium → /plans, and the FAQ is an
// accordion.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

let language = 'en';
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, language, toggleLanguage: vi.fn() }),
}));

const { default: LandingPage } = await import('../src/pages/LandingPage.jsx');
const { default: PremiumPage } = await import('../src/pages/site/PremiumPage.jsx');
const { default: PlansPage } = await import('../src/pages/site/PlansPage.jsx');

function Where() {
  const { pathname, search } = useLocation();
  return <p>ROUTE:{pathname}{search}</p>;
}

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/premium" element={<PremiumPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/auth" element={<Where />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { language = 'en'; });
afterEach(cleanup);

describe('website', () => {
  test('one h1 with the approved headline', () => {
    renderAt('/');
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe('Train your mind like a pro.');
  });

  test('Start free opens sign-up', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getAllByRole('button', { name: /^Start free/ })[0]);
    expect(await screen.findByText('ROUTE:/auth?tab=signup')).toBeTruthy();
  });

  test('Sign in in the header opens sign-in', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(await screen.findByText('ROUTE:/auth?tab=signin')).toBeTruthy();
  });

  test('no price is shown on the home page', () => {
    const { container } = renderAt('/');
    expect(container.textContent).not.toMatch(/₹/);
  });

  test('"What\'s in Premium?" opens the Free vs Premium page', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByTestId('site-premium-link'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Play with a calmer, sharper mind.' })).toBeTruthy();
  });

  test('FAQ rows open and close; the first is open to start', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const first = screen.getByRole('button', { name: 'Is Arjun therapy?' });
    expect(first.getAttribute('aria-expanded')).toBe('true');
    const second = screen.getByRole('button', { name: 'Does it actually work?' });
    await user.click(second);
    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(first.getAttribute('aria-expanded')).toBe('false');
    await user.click(second);
    expect(second.getAttribute('aria-expanded')).toBe('false');
  });

  test('the hero phone shows a screen and the dots switch screens', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const phone = screen.getByTestId('site-hero-phone');
    expect(phone.getAttribute('data-screen')).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Show screen 3' }));
    expect(phone.getAttribute('data-screen')).toBe('2');
    expect(screen.getByRole('button', { name: 'Show screen 3' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Free vs Premium and plans', () => {
  test('the Premium page shows the yearly price and links to all plans', async () => {
    const user = userEvent.setup();
    renderAt('/premium');
    expect(screen.getByText(/Then ₹2,500\/year \(about ₹208\/month\)/)).toBeTruthy();
    const table = screen.getByTestId('premium-table');
    expect(within(table).getAllByRole('img', { name: 'Included' }).length).toBeGreaterThan(6);
    await user.click(screen.getByRole('link', { name: 'See all plans' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose your plan' })).toBeTruthy();
  });

  test('plans: yearly is chosen by default, monthly costs ₹500, and the choice carries to sign-up', async () => {
    const user = userEvent.setup();
    renderAt('/plans');
    const yearly = screen.getByRole('radio', { name: /Yearly/ });
    const monthly = screen.getByRole('radio', { name: /Monthly/ });
    expect(yearly.getAttribute('aria-checked')).toBe('true');
    expect(yearly.textContent).toMatch(/save 58%/i);
    expect(monthly.textContent).toMatch(/₹500/);
    await user.click(monthly);
    expect(monthly.getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Start 14 days free' }));
    expect(await screen.findByText('ROUTE:/auth?tab=signup&plan=monthly')).toBeTruthy();
  });
});
