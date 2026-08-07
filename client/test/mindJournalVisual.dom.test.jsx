// Narrow-width / EN-HI / light-dark smoke checks for Mind Journal custom state UI.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = { user: { id: 'u1', onboardingDone: true }, token: 't', language: 'en', updateUser: vi.fn() };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: MindJournalPage } = await import('../src/pages/MindJournalPage.jsx');
const { default: QuickNotePage } = await import('../src/pages/mindJournal/QuickNotePage.jsx');
const { default: GuidedReflectionPage } = await import('../src/pages/mindJournal/GuidedReflectionPage.jsx');

const json = (body) => ({ ok: true, status: 200, json: async () => body });
const LONG = 'abcdefghijabcdefghijabcdefghij'; // 30 chars

function setWidth(px) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: px });
  document.documentElement.style.width = `${px}px`;
  document.body.style.width = `${px}px`;
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => json({
    contextEnabled: false,
    entries: [{
      id: '1', entryType: 'QUICK_NOTE', states: [], customState: LONG,
      note: null, createdAt: '2026-08-01T10:00:00.000Z',
    }],
  }));
  authState.language = 'en';
  document.documentElement.setAttribute('data-theme', 'light');
});
afterEach(cleanup);

describe('Mind Journal visual / a11y smoke', () => {
  for (const width of [320, 360, 430]) {
    test(`home custom pill wraps at ${width}px without relying on horizontal scroll classes`, async () => {
      setWidth(width);
      render(
        <MemoryRouter initialEntries={['/mind-journal']}>
          <Routes><Route path="/mind-journal" element={<MindJournalPage />} /></Routes>
        </MemoryRouter>
      );
      const pill = await screen.findByText(LONG);
      expect(pill.className).toMatch(/break-words/);
      expect(pill.className).toMatch(/max-w-full/);
      // Card container should allow wrapping rather than a fixed single-line row.
      expect(pill.closest('[data-testid="mj-reflection-card"]').className).not.toMatch(/overflow-x-scroll/);
    });
  }

  test('Quick Note: Something else field, counter, and focus styles are reachable (EN)', async () => {
    setWidth(320);
    render(
      <MemoryRouter initialEntries={['/mind-journal/quick']}>
        <Routes><Route path="/mind-journal/quick" element={<QuickNotePage />} /></Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Something else' }));
    const field = screen.getByLabelText('Write your own state');
    expect(field).toBeTruthy();
    expect(field.getAttribute('maxLength')).toBe('30');
    await userEvent.type(field, LONG);
    expect(screen.getByText('30/30')).toBeTruthy();
    expect(field.className).toMatch(/focus-visible:ring/);
  });

  test('Quick Note: Hindi copy for Something else and custom label (no hardcoded English)', async () => {
    authState.language = 'hi';
    setWidth(360);
    render(
      <MemoryRouter initialEntries={['/mind-journal/quick']}>
        <Routes><Route path="/mind-journal/quick" element={<QuickNotePage />} /></Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'कुछ और' }));
    expect(screen.getByLabelText('अपनी स्थिति लिखो')).toBeTruthy();
    expect(screen.queryByLabelText('Write your own state')).toBeNull();
  });

  test('Guided Step 1 exposes Something else under dark theme tokens', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    setWidth(430);
    render(
      <MemoryRouter initialEntries={['/mind-journal/new']}>
        <Routes><Route path="/mind-journal/new" element={<GuidedReflectionPage />} /></Routes>
      </MemoryRouter>
    );
    const btn = await screen.findByTestId('mj-something-else');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('mj-custom-state-field')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('Guided Step 1: Something else context reveals customContext field with counter at 320px', async () => {
    setWidth(320);
    render(
      <MemoryRouter initialEntries={['/mind-journal/new']}>
        <Routes><Route path="/mind-journal/new" element={<GuidedReflectionPage />} /></Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Something else' }));
    const field = screen.getByLabelText('What was it about?');
    expect(field).toBeTruthy();
    expect(field.getAttribute('maxLength')).toBe('80');
    const long = 'x'.repeat(80);
    await userEvent.type(field, long);
    expect(screen.getByText('80/80')).toBeTruthy();
    expect(field.className).toMatch(/focus-visible:ring/);
  });

  test('Guided Step 1: Hindi custom context label (no hardcoded English)', async () => {
    authState.language = 'hi';
    setWidth(360);
    render(
      <MemoryRouter initialEntries={['/mind-journal/new']}>
        <Routes><Route path="/mind-journal/new" element={<GuidedReflectionPage />} /></Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'कुछ और' }));
    expect(screen.getByLabelText('किस बारे में था — अपने शब्दों में?')).toBeTruthy();
    expect(screen.queryByLabelText('What was it about?')).toBeNull();
  });
});
