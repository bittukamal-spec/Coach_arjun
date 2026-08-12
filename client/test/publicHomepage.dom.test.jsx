// Rendered behaviour of the public homepage: the copy a visitor actually
// sees, the two auth routes, the FAQ accordion, carousel accessibility, the
// language switch, and the absence of any audio affordance or legacy claim.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const toggleLanguage = vi.fn();
let language = 'en';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, language, toggleLanguage }),
}));

const { default: LandingPage } = await import('../src/pages/LandingPage.jsx');

// Stands in for AuthPage so route + query string are observable.
function AuthSink() {
  const { pathname, search } = useLocation();
  return <p>AUTH_ROUTE:{pathname}{search}</p>;
}

function renderHome(lang = 'en') {
  language = lang;
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthSink />} />
        <Route path="/privacy" element={<p>PRIVACY</p>} />
        <Route path="/terms" element={<p>TERMS</p>} />
        <Route path="/refund" element={<p>REFUND</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { toggleLanguage.mockClear(); language = 'en'; });
afterEach(cleanup);

describe('hero', () => {
  test('one h1, carrying the approved headline', () => {
    renderHome();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Your AI coach for the moments that matter.');
  });

  test('the subtitle describes the current product', () => {
    renderHome();
    expect(screen.getByText('Mental coaching for Indian athletes.')).toBeTruthy();
  });

  test('Create account goes to /auth (signup), unchanged', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getAllByRole('button', { name: /create account/i })[0]);
    expect(screen.getByText('AUTH_ROUTE:/auth')).toBeTruthy();
  });

  test('Sign in goes to /auth?tab=signin, unchanged', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByText('AUTH_ROUTE:/auth?tab=signin')).toBeTruthy();
  });

  test('the hero product visual represents a Coach conversation ending in a Mental Rep', () => {
    renderHome();
    const visual = screen.getByRole('img', { name: /coaching conversation/i });
    expect(within(visual).getByText('What happened today?')).toBeTruthy();
    expect(within(visual).getByText('I lost focus after a mistake.')).toBeTruthy();
    expect(within(visual).getAllByText('Reset after a mistake').length).toBeGreaterThan(0);
    expect(within(visual).getByText('Start')).toBeTruthy();
  });
});

describe('no audio anywhere', () => {
  test('no audio element and no play/listen control', () => {
    const { container } = renderHome();
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByRole('button', { name: /\bplay\b|\blisten\b|\baudio\b|\bvoice\b|\brecord\b|waveform|microphone/i })).toBeNull();
    expect(container.textContent).not.toMatch(/waveform|voice note|\blisten\b|\baudio\b|0:\d\d/i);
  });
});

describe('no legacy product claims', () => {
  test('no Daily Pulse, tracking, personality test, scores or fake social proof', () => {
    const { container } = renderHome();
    const text = container.textContent;
    expect(text).not.toMatch(/daily pulse/i);
    expect(text).not.toMatch(/\bmood\b|\bsleep\b|\benergy\b/i);
    expect(text).not.toMatch(/personality/i);
    expect(text).not.toMatch(/\bscore\b|\bxp\b|streak/i);
    expect(text).not.toMatch(/thousands|rating|★|review|trusted by/i);
    expect(text).not.toMatch(/\d+%/);
  });
});

describe('value strip', () => {
  test('shows the five short value labels', () => {
    renderHome();
    for (const label of ['Coach conversations', '2-min Mental Reps', 'Save cues', 'Hindi + English', 'Private by design']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('How Arjun helps', () => {
  test('renders the four intended use cases inside a labelled carousel', () => {
    renderHome();
    const region = screen.getByRole('region', { name: 'How Arjun helps' });
    for (const title of ['Before a match', 'After a setback', 'Build focus', 'Reflect & reset']) {
      expect(within(region).getByText(title)).toBeTruthy();
    }
    expect(within(region).getAllByRole('group')).toHaveLength(4);
  });
});

describe('app preview', () => {
  test('shows the four current product areas', () => {
    renderHome();
    const region = screen.getByRole('region', { name: 'Inside Arjun' });
    for (const title of ['Coach', 'Mental Reps', 'Playbook', 'Focus Cards']) {
      expect(within(region).getByRole('heading', { name: title })).toBeTruthy();
    }
  });
});

describe('carousel accessibility', () => {
  test('the track is focusable and moves with the arrow keys', async () => {
    const user = userEvent.setup();
    renderHome();
    const region = screen.getByRole('region', { name: 'How Arjun helps' });
    region.focus();
    expect(document.activeElement).toBe(region);
    // jsdom has no layout, so this asserts the handler runs without error and
    // the active dot advances — the visual scroll itself is covered by the
    // scroll-snap track in a real browser.
    await user.keyboard('{ArrowRight}');
    const dots = screen.getAllByRole('button', { name: /^How Arjun helps — / });
    expect(dots).toHaveLength(4);
    expect(dots[1].getAttribute('aria-current')).toBe('true');
  });

  test('prev/next controls exist, are labelled, and are disabled at the ends', async () => {
    const user = userEvent.setup();
    renderHome();
    const prev = screen.getByRole('button', { name: 'Previous — Inside Arjun' });
    const next = screen.getByRole('button', { name: 'Next — Inside Arjun' });
    expect(prev.disabled).toBe(true);
    await user.click(next);
    expect(screen.getByRole('button', { name: 'Previous — Inside Arjun' }).disabled).toBe(false);
  });

  test('a dot jumps straight to its card', async () => {
    const user = userEvent.setup();
    renderHome();
    const dots = screen.getAllByRole('button', { name: /^Inside Arjun — / });
    await user.click(dots[2]);
    expect(dots[2].getAttribute('aria-current')).toBe('true');
  });
});

describe('FAQ', () => {
  test('rows are collapsed buttons that expand on click and collapse again', async () => {
    const user = userEvent.setup();
    renderHome();
    const q = screen.getByRole('button', { name: /How is Arjun different\?/ });
    expect(q.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: /How is Arjun different\?/ })).toBeNull();

    await user.click(q);
    expect(q.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: /How is Arjun different\?/ });
    expect(panel.textContent).toMatch(/built for athletes/i);

    await user.click(q);
    expect(q.getAttribute('aria-expanded')).toBe('false');
  });

  test('rows are reachable and operable from the keyboard alone', async () => {
    const user = userEvent.setup();
    renderHome();
    const q = screen.getByRole('button', { name: /Is Arjun therapy\?/ });
    q.focus();
    await user.keyboard('{Enter}');
    expect(q.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: /Is Arjun therapy\?/ }).textContent)
      .toMatch(/not therapy, diagnosis or emergency help/i);
  });
});

describe('PWA install', () => {
  test('install is not a hero CTA — it lives in the menu, behind the primary actions', async () => {
    const user = userEvent.setup();
    renderHome();
    expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: /install app/i })).toBeTruthy();
    // The primary conversion is still account creation.
    expect(screen.getAllByRole('button', { name: /create account/i }).length).toBeGreaterThan(0);
  });

  test('the menu opens and closes and is keyboard-dismissible', async () => {
    const user = userEvent.setup();
    renderHome();
    const trigger = screen.getByRole('button', { name: /open menu/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(screen.getByRole('button', { name: /close menu/i }).getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('language', () => {
  test('the language control calls the existing toggle', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /language/i }));
    expect(toggleLanguage).toHaveBeenCalledTimes(1);
  });

  test('Hindi renders Hindi copy across hero, cards and FAQ', () => {
    renderHome('hi');
    expect(screen.getAllByRole('heading', { level: 1 })[0].textContent)
      .toBe('तुम्हारा AI कोच उन पलों के लिए जो मायने रखते हैं।');
    expect(screen.getByText('भारतीय एथलीट्स के लिए मेंटल कोचिंग।')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /खाता बनाओ/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('मैच से पहले')).toBeTruthy();
    expect(screen.getByRole('button', { name: /क्या Arjun थेरेपी है\?/ })).toBeTruthy();
  });
});

describe('legal links', () => {
  test('the footer still exposes the public child-safety statement', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: 'Child Safety' }));
    expect(screen.getByText('TERMS')).toBeTruthy();
  });
});
