// Rendered behaviour of the public Contact page: field validation, the
// honeypot, sending/success/error/rate-limit states, duplicate-submit
// prevention and accessibility labels. Same fake-apiFetch pattern used by
// performanceCheckin.dom.test.jsx.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = { user: null, token: null, language: 'en' };
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../src/api', () => ({ apiFetch: vi.fn() }));

const { apiFetch } = await import('../src/api');
const { default: ContactPage } = await import('../src/pages/ContactPage.jsx');

function renderContact() {
  return render(
    <MemoryRouter initialEntries={['/contact']}>
      <Routes>
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/" element={<p>HOME</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID = {
  name: 'Aarav Singh',
  email: 'aarav@example.com',
  reason: 'Technical issue',
  message: 'The app crashes when I open the chat screen on Android 14.',
};

async function fillValidForm(user) {
  await user.type(screen.getByLabelText('Name'), VALID.name);
  await user.type(screen.getByLabelText('Email'), VALID.email);
  await user.selectOptions(screen.getByLabelText('Reason'), VALID.reason);
  await user.type(screen.getByLabelText('Message'), VALID.message);
}

beforeEach(() => {
  apiFetch.mockReset();
  authState.language = 'en';
});
afterEach(() => cleanup());

describe('route + access', () => {
  test('renders at /contact with no login/auth requirement', () => {
    renderContact();
    expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeTruthy();
  });
});

describe('field requirements', () => {
  test('name is required', async () => {
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('Email'), VALID.email);
    await user.selectOptions(screen.getByLabelText('Reason'), VALID.reason);
    await user.type(screen.getByLabelText('Message'), VALID.message);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Please enter your name/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('email is required', async () => {
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('Name'), VALID.name);
    await user.selectOptions(screen.getByLabelText('Reason'), VALID.reason);
    await user.type(screen.getByLabelText('Message'), VALID.message);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Please enter a valid email/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('email format is validated', async () => {
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('Name'), VALID.name);
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.selectOptions(screen.getByLabelText('Reason'), VALID.reason);
    await user.type(screen.getByLabelText('Message'), VALID.message);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Please enter a valid email/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('reason is required', async () => {
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('Name'), VALID.name);
    await user.type(screen.getByLabelText('Email'), VALID.email);
    await user.type(screen.getByLabelText('Message'), VALID.message);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Please choose a reason/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('message is required', async () => {
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('Name'), VALID.name);
    await user.type(screen.getByLabelText('Email'), VALID.email);
    await user.selectOptions(screen.getByLabelText('Reason'), VALID.reason);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Please write a message/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('message length is enforced (too short is rejected)', async () => {
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('Name'), VALID.name);
    await user.type(screen.getByLabelText('Email'), VALID.email);
    await user.selectOptions(screen.getByLabelText('Reason'), VALID.reason);
    await user.type(screen.getByLabelText('Message'), 'too short');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Please write a message/)).toBeTruthy();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('the reason options exactly match the approved set', () => {
    renderContact();
    const select = screen.getByLabelText('Reason');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'Choose a reason', 'General', 'Technical issue', 'Subscription or billing', 'Safety or privacy', 'Partnership',
    ]);
  });
});

describe('honeypot', () => {
  test('exists in the DOM but is out of the tab order and hidden from assistive tech', () => {
    renderContact();
    // Present for a naive bot to fill, but never reachable by a keyboard
    // user (tabIndex -1) or a screen reader (its container is aria-hidden).
    const input = document.querySelector('input[name="website"]');
    expect(input).toBeTruthy();
    expect(input.tabIndex).toBe(-1);
    expect(input.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  test('a filled honeypot is still submitted to the server (server enforces the trap silently)', async () => {
    apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const user = userEvent.setup();
    renderContact();
    const honeypot = document.querySelector('input[name="website"]');
    await user.type(honeypot, 'http://spam.example');
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Message sent');
    const [, init] = apiFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.website).toBe('http://spam.example');
  });
});

describe('submit states', () => {
  test('sending disables the button and prevents a duplicate submit', async () => {
    let resolveFetch;
    apiFetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    renderContact();
    await fillValidForm(user);
    const button = screen.getByRole('button', { name: 'Send message' });
    await user.click(button);
    const sendingButton = await screen.findByRole('button', { name: 'Sending…' });
    expect(sendingButton.disabled).toBe(true);
    // A second click while sending must not fire a second request.
    await user.click(sendingButton);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true, status: 200, json: async () => ({ success: true }) });
    await screen.findByText('Message sent');
  });

  test('success state shows the confirmation and a Back to home action', async () => {
    apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const user = userEvent.setup();
    renderContact();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Message sent')).toBeTruthy();
    expect(screen.getByText("Thanks for contacting Arjun. We'll get back to you as soon as we can.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to home' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(await screen.findByText('HOME')).toBeTruthy();
  });

  test('a generic server error is shown without leaking internal detail', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom internal' }) });
    const user = userEvent.setup();
    renderContact();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText("We couldn't send your message. Please try again.")).toBeTruthy();
    expect(screen.queryByText(/boom internal/)).toBeNull();
  });

  test('a 429 rate-limit response shows the rate-limit message', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'Too many messages sent. Please try again later.' }) });
    const user = userEvent.setup();
    renderContact();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Too many messages sent. Please try again later.')).toBeTruthy();
  });
});

describe('EN/HI parity', () => {
  test('the Hindi page renders translated field labels and heading', () => {
    authState.language = 'hi';
    renderContact();
    expect(screen.getByRole('heading', { name: 'हम आपकी कैसे मदद कर सकते हैं?' })).toBeTruthy();
    expect(screen.getByLabelText('नाम')).toBeTruthy();
    expect(screen.getByLabelText('ईमेल')).toBeTruthy();
    expect(screen.getByLabelText('कारण')).toBeTruthy();
    expect(screen.getByLabelText('संदेश')).toBeTruthy();
  });

  test('user-entered text is never translated — it round-trips exactly as typed', async () => {
    authState.language = 'hi';
    apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const user = userEvent.setup();
    renderContact();
    await user.type(screen.getByLabelText('नाम'), VALID.name);
    await user.type(screen.getByLabelText('ईमेल'), VALID.email);
    await user.selectOptions(screen.getByLabelText('कारण'), 'तकनीकी समस्या');
    await user.type(screen.getByLabelText('संदेश'), VALID.message);
    await user.click(screen.getByRole('button', { name: 'संदेश भेजें' }));
    await screen.findByText('संदेश भेजा गया');
    const [, init] = apiFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.name).toBe(VALID.name);
    expect(body.message).toBe(VALID.message);
  });
});

describe('accessibility', () => {
  test('every field has a real accessible label, not a placeholder-only one', () => {
    renderContact();
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Reason')).toBeTruthy();
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });

  test('exactly one h1 in the default view', () => {
    renderContact();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('unaffected routes', () => {
  test('the app-shell page rendered at "/" for this test harness is untouched by the Contact page module', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/" element={<p>HOME</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('HOME')).toBeTruthy();
    expect(screen.queryByText('How can we help?')).toBeNull();
  });
});
