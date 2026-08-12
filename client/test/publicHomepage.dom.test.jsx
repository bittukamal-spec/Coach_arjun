// Rendered behaviour of the public homepage: the copy a visitor actually
// sees, the two auth routes, the FAQ accordion, carousel accessibility, the
// language switch, and the absence of any audio affordance or legacy claim.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, act } from '@testing-library/react';
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
    expect(headings[0].textContent).toBe('Train your mind. Perform under pressure.');
  });

  test('the subtext names focus, pressure and confidence', () => {
    renderHome();
    expect(screen.getByText('Train focus, handle pressure and build confidence with Arjun.')).toBeTruthy();
  });

  test('opens on the headline — no eyebrow above it', () => {
    renderHome();
    expect(screen.queryByText('AI Mental Coach for Athletes')).toBeNull();
  });

  test('the hero CTA is Install Arjun, and there are no account CTAs on the page', () => {
    renderHome();
    expect(screen.getAllByRole('button', { name: /^install arjun$/i }).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull();
    // Sign in is not a page CTA — it only exists inside the menu.
    expect(screen.queryByRole('button', { name: /^sign in$/i })).toBeNull();
  });

  test('no fake app-store badges', () => {
    const { container } = renderHome();
    expect(container.textContent).not.toMatch(/app store|google play|get it on/i);
  });

  test('Sign in is still reachable from the menu and still goes to /auth?tab=signin', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByText('AUTH_ROUTE:/auth?tab=signin')).toBeTruthy();
  });

  test('the hero phone shows Arjun asking questions and checking its understanding', () => {
    renderHome();
    const visual = screen.getByRole('img', { name: /Coach asking/i });
    expect(within(visual).getByText('What happened today?')).toBeTruthy();
    expect(within(visual).getByText('I lost focus after a mistake.')).toBeTruthy();
    expect(within(visual).getByText('What happened in the next few moments?')).toBeTruthy();
    expect(within(visual).getByText(/Does that fit\?/)).toBeTruthy();
    expect(within(visual).getByText('Yes')).toBeTruthy();
    expect(within(visual).getByText('Not quite')).toBeTruthy();
    // The hero stops before prescribing anything.
    expect(within(visual).queryByText(/Start Mental Rep/i)).toBeNull();
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
    expect(text).not.toMatch(/thousands|\brating\b|★|\breviews\b|star review|trusted by/i);
    expect(text).not.toMatch(/\d+%/);
  });
});

describe('benefit tags', () => {
  const LABELS = ['Talk it through', 'Quick Mental Reps', 'Save what works', 'Hindi + English', 'Private by design'];

  test('shows the five coloured tags', () => {
    renderHome();
    const tags = screen.getByRole('region', { name: 'What you get' });
    for (const label of LABELS) expect(within(tags).getByText(label)).toBeTruthy();
    expect(within(tags).getAllByRole('listitem')).toHaveLength(5);
  });

  test('each tag carries its own accent rather than one shared pill style', () => {
    renderHome();
    const tags = screen.getByRole('region', { name: 'What you get' });
    const colours = LABELS.map((label) => within(tags).getByText(label).style.color);
    expect(new Set(colours).size).toBe(5);
    // No supporting sentence under a tag.
    for (const item of within(tags).getAllByRole('listitem')) {
      expect(item.textContent.length).toBeLessThanOrEqual(20);
    }
  });
});

describe('How Arjun helps', () => {
  test('renders the four intended use cases inside a labelled carousel', () => {
    renderHome();
    const region = screen.getByRole('region', { name: 'How Arjun helps' });
    for (const title of ['Before a match', 'Under pressure', 'After a setback', 'Build your mental game']) {
      expect(within(region).getByText(title)).toBeTruthy();
    }
    expect(within(region).getAllByRole('group')).toHaveLength(4);
  });
});

describe('app preview', () => {
  test('shows the four current product areas', () => {
    renderHome();
    const region = screen.getByRole('region', { name: 'Inside Arjun' });
    for (const title of ['Coach', 'Mental Reps', 'Playbook', 'Arjun remembers your game']) {
      expect(within(region).getByRole('heading', { name: title })).toBeTruthy();
    }
  });

  test('the previews are real current screens — coaching, a rep, saved cues, the pressure profile', () => {
    renderHome();
    const region = screen.getByRole('region', { name: 'Inside Arjun' });
    expect(within(region).getByText("What's been getting in the way lately?")).toBeTruthy();
    expect(within(region).getByText('Start Mental Rep')).toBeTruthy();
    expect(within(region).getByText('Latest lesson')).toBeTruthy();
    expect(within(region).getAllByText('When pressure hits').length).toBeGreaterThan(0);
    expect(within(region).getByText('First response')).toBeTruthy();
  });

  test('no preview shows a graph, score, streak or audio control', () => {
    renderHome();
    const region = screen.getByRole('region', { name: 'Inside Arjun' });
    expect(region.textContent).not.toMatch(/\bscore\b|streak|\bxp\b|\bchart\b|\bgraph\b|\d+%|\blisten\b/i);
    expect(region.querySelector('audio')).toBeNull();
    expect(region.querySelector('svg[data-lucide="play"]')).toBeNull();
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
    const q = screen.getByRole('button', { name: /What is Arjun\?/ });
    expect(q.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: /What is Arjun\?/ })).toBeNull();

    await user.click(q);
    expect(q.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: /What is Arjun\?/ });
    expect(panel.textContent).toMatch(/AI mental-performance coach/i);

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
  test('install is a visible header action, and is gone from the menu', async () => {
    const user = userEvent.setup();
    renderHome();
    const header = screen.getByRole('banner');
    const installBtn = within(header).getByRole('button', { name: /install arjun/i });
    expect(installBtn).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const menu = document.getElementById('landing-menu');
    expect(within(menu).queryByRole('button', { name: /install/i })).toBeNull();
    expect(within(menu).getByRole('button', { name: /^sign in$/i })).toBeTruthy();
  });

  test('with no beforeinstallprompt, the header action falls back to instructions', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /install arjun/i }));
    expect(screen.getByText('How to install')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('How to install')).toBeNull();
  });

  test('once installed, no misleading install action is shown', async () => {
    const { container } = renderHome();
    await act(async () => { window.dispatchEvent(new Event('appinstalled')); });
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /install arjun/i })).toBeNull();
    expect(container.textContent).toMatch(/App installed/);
    expect(screen.queryByRole('button', { name: /^install arjun$/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: /open arjun/i }).length).toBeGreaterThanOrEqual(3);
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
      .toBe('दिमाग़ को ट्रेन करो। दबाव में बेहतर खेलो।');
    expect(screen.getByText('Arjun के साथ फोकस बनाओ, दबाव संभालो और आत्मविश्वास बढ़ाओ।')).toBeTruthy();
    expect(screen.getByText('मैच से पहले')).toBeTruthy();
    expect(screen.getByText('₹2,499 / साल')).toBeTruthy();
    expect(screen.getByRole('button', { name: /क्या Arjun थेरेपी है\?/ })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'जब दबाव आता है' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'सोचो और सीखो' })).toBeTruthy();
    expect(screen.getByText('₹299 / महीना')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Arjun इंस्टॉल करो/ }).length).toBeGreaterThanOrEqual(3);
  });
});

describe('personalisation', () => {
  test('shows the three Profile-mirrored cards with their real stage names', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'Built around you' })).toBeTruthy();
    for (const title of ['Your game', 'When pressure hits', 'What works for you']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    // The When Pressure Hits flow uses the Profile's own athlete-facing labels.
    expect(screen.getAllByText('Situation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('First response').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Performance impact').length).toBeGreaterThan(0);
    expect(screen.getByText('What tends to happen in difficult moments.')).toBeTruthy();
  });

  test('claims nothing about personality or mental state', () => {
    const { container } = renderHome();
    expect(container.textContent).not.toMatch(/personality|mental state|performance pattern|knows you|learns everything/i);
  });
});

describe('sport psychology principles', () => {
  test('shows three principles and no measured-outcome claim', () => {
    const { container } = renderHome();
    expect(screen.getByRole('heading', { name: 'Built around sport psychology principles' })).toBeTruthy();
    for (const title of ['Reset after setbacks', 'Focus & self-talk', 'Reflect & learn']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    expect(container.textContent).not.toMatch(/\d+\s*%|proven|clinically|evidence-based|et al\./i);
  });
});

describe('hero device', () => {
  test('the hero visual is one realistic phone, not a stack of marketing cards', () => {
    renderHome();
    const visual = screen.getByRole('img', { name: /Coach asking/i });
    // A single device frame, and the app's real dark screen inside it.
    const screens = visual.querySelectorAll('[style*="rgb(7, 19, 31)"]');
    expect(screens.length).toBeGreaterThan(0);
    expect(visual.querySelectorAll('.rounded-\\[2\\.4rem\\]')).toHaveLength(1);
  });
});

describe('final CTA', () => {
  test('carries both actions and no social proof', () => {
    const { container } = renderHome();
    expect(screen.getByText('Ready to play your best?')).toBeTruthy();
    expect(screen.getByText('Install Arjun and start training your mind.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^install arjun$/i }).length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).not.toMatch(/thousands|★|loved by|athletes trust/i);
  });
});

describe('pricing', () => {
  test('has its own heading above two plans', () => {
    renderHome();
    const heading = screen.getByRole('heading', { name: 'Choose your plan' });
    expect(heading).toBeTruthy();
    expect(screen.getByText('Both plans start with 14 days free.')).toBeTruthy();
    expect(screen.getByText('Monthly')).toBeTruthy();
    expect(screen.getByText('Yearly')).toBeTruthy();
  });

  test('shows the real launch prices and the correct saving', () => {
    const { container } = renderHome();
    expect(screen.getByText('₹299 / month')).toBeTruthy();
    expect(screen.getByText('₹2,499 / year')).toBeTruthy();
    expect(screen.getByText('Save ₹1,089 a year')).toBeTruthy();
    const prices = container.textContent.match(/₹[\d,]+/g) || [];
    expect([...new Set(prices)].sort()).toEqual(['₹1,089', '₹2,499', '₹299']);
    expect(container.textContent).not.toMatch(/limited time|guarantee|most popular/i);
  });

  test('POPULAR appears on the yearly plan only', () => {
    renderHome();
    const badges = screen.getAllByText('Popular');
    expect(badges).toHaveLength(1);
    const yearlyCard = screen.getByText('₹2,499 / year').closest('div');
    expect(yearlyCard.textContent).toMatch(/Popular/);
  });

  test('both plans list the benefits, yearly adds one', () => {
    renderHome();
    for (const benefit of ['AI Coach conversations', 'Mental Reps', 'Playbook & saved cues']) {
      expect(screen.getAllByText(benefit).length).toBeGreaterThanOrEqual(2);
    }
    expect(screen.getByText('Best value for regular training')).toBeTruthy();
  });

  test('both plan CTAs run the existing install action, not a fake checkout', async () => {
    const user = userEvent.setup();
    renderHome();
    const monthly = screen.getByRole('button', { name: 'Choose monthly' });
    const yearly = screen.getByRole('button', { name: 'Choose yearly' });
    await user.click(monthly);
    await user.click(yearly);
    // No navigation to an invented checkout route happened.
    expect(screen.queryByText(/AUTH_ROUTE/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Choose your plan' })).toBeTruthy();
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
