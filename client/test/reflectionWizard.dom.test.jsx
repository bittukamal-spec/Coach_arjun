// Unified Mind Journal reflection wizard (PR 1) — real DOM behaviour:
// one question per screen, Back never losing an answer, max-2 enforcement,
// the deterministic Q6 resolver, and the exact POST shape.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test Athlete' }, token: 't', language: 'en' }),
}));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: ReflectionWizard } = await import('../src/pages/mindJournal/ReflectionWizard.jsx');

const json = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

function Probe() {
  const loc = useLocation();
  return <p data-testid="pathname">{loc.pathname}</p>;
}

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/mind-journal/new']}>
      <Probe />
      <Routes>
        <Route path="/mind-journal/new" element={<ReflectionWizard />} />
        <Route path="/mind-journal" element={<p data-testid="journal">journal</p>} />
        <Route path="/mind-journal/saved/:id" element={<p data-testid="saved">saved</p>} />
      </Routes>
    </MemoryRouter>
  );
}

// GET supplies the athlete's active Focus Card word (null = no card).
function mockApi({ focusWord = null, saveResponse } = {}) {
  apiFetch.mockImplementation(async (path, init) => {
    if (path === '/api/mind-journal' && init?.method === 'POST') {
      return json(saveResponse || { entry: { id: 'r1', entryType: 'REFLECTION' } });
    }
    return json({ entries: [], contextEnabled: false, focusWord });
  });
}

const postedBody = () => {
  const call = apiFetch.mock.calls.find(([p, i]) => p === '/api/mind-journal' && i?.method === 'POST');
  expect(call, 'a POST must have been made').toBeTruthy();
  return JSON.parse(call[1].body);
};

const clickName = async (name) => userEvent.click(await screen.findByRole('button', { name }));
const clickRadio = async (name) => userEvent.click(await screen.findByRole('radio', { name }));
const next = () => clickName('Next');

// Q1 → Q2. Q1 auto-advances on its own after a short delay.
async function pickContext(label) {
  await clickRadio(label);
  await screen.findByRole('heading', { level: 2, name: /What happened|What went well|When did this come up|What was going on/ });
}

beforeEach(() => { apiFetch.mockReset(); mockApi(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('one question per screen', () => {
  test('opens on Q1 alone — no other question is on screen', async () => {
    renderWizard();
    expect(await screen.findByRole('heading', { level: 2, name: 'What are you reflecting on?' })).toBeTruthy();
    for (const other of [
      'How did you feel when this was happening?',
      'What was going through your mind when this happened?',
      'What did you do when this happened?',
    ]) {
      expect(screen.queryByRole('heading', { name: other })).toBeNull();
    }
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 1 of 5/);
  });

  test('walks Q1 → Q5 one at a time, with the progress indicator tracking', async () => {
    renderWizard();
    await pickContext('Training');
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 2 of 5/);

    await next();
    expect(await screen.findByRole('heading', { level: 2, name: 'How did you feel when this was happening?' })).toBeTruthy();
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 3 of 5/);

    await next();
    expect(await screen.findByRole('heading', { level: 2, name: 'What was going through your mind when this happened?' })).toBeTruthy();

    await next();
    expect(await screen.findByRole('heading', { level: 2, name: 'What did you do when this happened?' })).toBeTruthy();
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 5 of 5/);
    expect(screen.getByRole('button', { name: 'Save reflection' })).toBeTruthy();
  });

  test('only Q1 auto-advances; a multi-select tap never commits the question', async () => {
    renderWizard();
    await pickContext('Training');            // auto-advanced on a single choice
    await clickName('A full session');
    // Still on Q2 — selecting is not the same as answering.
    expect(screen.getByRole('heading', { level: 2, name: 'What happened in training?' })).toBeTruthy();
  });
});

describe('Back never loses an answer', () => {
  test('returning to an earlier question restores every selection', async () => {
    renderWizard();
    await pickContext('Training');
    await clickName('A full session');
    await next();
    await clickName('Calm');
    await next();

    await clickName('Back');
    expect((await screen.findByRole('button', { name: 'Calm' })).getAttribute('aria-pressed')).toBe('true');
    await clickName('Back');
    expect((await screen.findByRole('button', { name: 'A full session' })).getAttribute('aria-pressed')).toBe('true');
    await clickName('Back');
    expect((await screen.findByRole('radio', { name: 'Training' })).getAttribute('aria-checked')).toBe('true');
  });

  test('a typed "Write my own" answer survives Back too', async () => {
    renderWizard();
    await pickContext('Training');
    await clickName('Write my own');
    await userEvent.type(screen.getByLabelText('Write it in your own words'), 'net session');
    await next();
    await clickName('Back');
    expect(screen.getByLabelText('Write it in your own words').value).toBe('net session');
  });

  test('Back from the first question leaves the wizard', async () => {
    renderWizard();
    await screen.findByRole('heading', { level: 2, name: 'What are you reflecting on?' });
    await clickName('Back');
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal');
  });
});

describe('max-2 selection', () => {
  test('a third selection is refused on every multi-select question', async () => {
    renderWizard();
    await pickContext('Training');
    await clickName('A full session');
    await clickName('Part of a session');
    await clickName('Feedback from my coach');
    expect(screen.getByRole('button', { name: 'Feedback from my coach' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'A full session' }).getAttribute('aria-pressed')).toBe('true');
  });

  test('"Write my own" occupies one of the two slots', async () => {
    renderWizard();
    await pickContext('Training');
    await clickName('A full session');
    await clickName('Write my own');
    await clickName('Part of a session');
    expect(screen.getByRole('button', { name: 'Part of a session' }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('conditional Q6', () => {
  test('a calm training reflection finishes after Q5 — no sixth question', async () => {
    renderWizard();
    await pickContext('Training');
    await next(); await clickName('Calm'); await next(); await next();
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 5 of 5/);
    expect(screen.getByRole('button', { name: 'Save reflection' })).toBeTruthy();
  });

  test('reporting nerves in training adds the body question', async () => {
    renderWizard();
    await pickContext('Training');
    await next();
    await clickName('Nervous');
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 3 of 6/);
    await next(); await next(); await next();
    expect(await screen.findByRole('heading', { level: 2, name: 'What did you notice in your body?' })).toBeTruthy();
  });

  test('with no Focus Card, a competition reflection gets the body question, never the cue one', async () => {
    mockApi({ focusWord: null });
    renderWizard();
    await pickContext('Match / competition');
    await next(); await next(); await next(); await next();
    expect(await screen.findByRole('heading', { level: 2, name: 'What did you notice in your body?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Did your focus word help?' })).toBeNull();
  });

  test('with an active Focus Card, the cue question wins — and never both', async () => {
    mockApi({ focusWord: 'Breathe' });
    renderWizard();
    await pickContext('Match / competition');
    await next(); await clickName('Nervous'); await next(); await next(); await next();
    expect(await screen.findByRole('heading', { level: 2, name: 'Did your focus word help?' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'What did you notice in your body?' })).toBeNull();
    expect(within(screen.getByTestId('mj-cue-word')).getByText('Breathe')).toBeTruthy();
  });

  test('a Focus Card does not force the cue question into an unrelated reflection', async () => {
    mockApi({ focusWord: 'Breathe' });
    renderWizard();
    await pickContext('Something that went well');
    await next(); await clickName('Confident'); await next(); await next();
    expect(screen.getByTestId('mj-step-progress').textContent).toMatch(/Step 5 of 5/);
    expect(screen.queryByRole('heading', { name: 'Did your focus word help?' })).toBeNull();
  });
});

describe('save', () => {
  test('POSTs exactly the REFLECTION shape and opens the review screen', async () => {
    mockApi({ focusWord: 'Breathe' });
    renderWizard();
    await pickContext('Match / competition');
    await clickName('One big moment');
    await next();
    await clickName('Nervous');
    await next();
    await clickName('I was worried about the result');
    await next();
    await clickName('I went faster than I meant to');
    await next();
    await clickRadio('Yes, it helped');
    await clickName('Save reflection');

    expect(postedBody()).toEqual({
      entryType: 'REFLECTION',
      contextType: 'COMPETITION',
      eventTags: ['key_moment'],
      states: ['nervous'],
      thoughtTags: ['worried_about_result'],
      responseTags: ['went_too_fast'],
      bodyTags: [],
      cueFeedback: 'helped',
      cueWordSnapshot: 'Breathe',
    });
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/saved/r1');
  });

  test('"Write my own" at Q1 is required before moving on, then rides along as customContext', async () => {
    renderWizard();
    await clickRadio('Write my own');
    await clickName('Next');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'What are you reflecting on?' })).toBeTruthy();

    await userEvent.type(screen.getByLabelText('What is it about?'), 'a long travel day');
    await clickName('Next');
    await clickName('It happened suddenly');
    await next(); await next(); await next();
    await clickName('Save reflection');

    const body = postedBody();
    expect(body.contextType).toBe('SOMETHING_ELSE');
    expect(body.customContext).toBe('a long travel day');
  });

  test('a reflection with no answers beyond the context cannot be saved', async () => {
    renderWizard();
    await pickContext('Training');
    await next(); await next(); await next();
    await clickName('Save reflection');
    expect(screen.getByText('Answer at least one question before saving.')).toBeTruthy();
    expect(apiFetch.mock.calls.filter(([p, i]) => p === '/api/mind-journal' && i?.method === 'POST')).toHaveLength(0);
  });

  test('typing is never required — a chips-only reflection saves', async () => {
    renderWizard();
    await pickContext('Training');
    await clickName('A full session');
    await next(); await next(); await next();
    await clickName('Save reflection');
    const body = postedBody();
    expect(body.eventTags).toEqual(['full_session']);
    expect(body.customEvent).toBeUndefined();
  });

  test('a safety-flagged submission shows guidance and never claims a save', async () => {
    mockApi({ saveResponse: { safetyFlag: 'needs_support', guidance: 'Please talk to someone you trust.' } });
    renderWizard();
    await pickContext('Training');
    await clickName('A full session');
    await next(); await next(); await next();
    await clickName('Save reflection');
    expect(await screen.findByText('Please talk to someone you trust.')).toBeTruthy();
    expect((await screen.findByTestId('pathname')).textContent).toBe('/mind-journal/new');
    expect(screen.queryByTestId('saved')).toBeNull();
  });
});

describe('nothing here asks the athlete to diagnose or fix themselves', () => {
  test('no question or option asks why, what is wrong, or what to change', async () => {
    mockApi({ focusWord: 'Breathe' });
    renderWizard();
    const banned = /\bwhy\b|what would you change|what.s wrong|your problem|need to fix|next focus|training priority|should you/i;
    const seen = [];
    await pickContext('Match / competition');
    for (let i = 0; i < 5; i++) {
      seen.push(document.body.textContent);
      const btn = screen.queryByRole('button', { name: 'Next' }) || screen.queryByRole('button', { name: 'Save reflection' });
      if (!btn) break;
      await userEvent.click(btn);
    }
    for (const text of seen) expect(text).not.toMatch(banned);
  });
});
