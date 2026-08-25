// Pilot Communications v1 — shared pure helpers.
//
// Used by BOTH the athlete-facing router (routes/pilotCommunications.js) and
// the founder router (routes/founderPilotCommunications.js), and unit-tested
// directly here (same convention as founderPilotOverview.js's exported pure
// helpers) so the eligibility/validation rules can never drift between the
// two surfaces.
//
// This module never touches Prisma or the network — everything here is a
// plain function over plain data.

const MAX_TITLE_LEN = 100;
const MAX_BODY_LEN = 500;
const MAX_CTA_LABEL_LEN = 30;
const MIN_CUSTOM_OPTIONS = 2;
const MAX_CUSTOM_OPTIONS = 5;
const MAX_OPTION_LEN = 40;

// Approved internal Arjun destinations a founder CTA may point to — sourced
// from client/src/App.jsx's LIVE routes only, as of this PR. Deliberately
// excludes: retired redirects (/playbook, /progress, /checkin,
// /mental-fitness, /mental-game-profile, /bounce-back, /before-you-play,
// /breathing, /games, /debrief), dynamic/param routes (/mind-journal/:id,
// /mind-journal/saved/:id, /games/focus-lock, /games/reset-rally,
// /starting-profile/check-in), and public/auth/payment pages that make no
// sense as a communication CTA (/, /auth, /payment-success, ...). A CTA
// route is checked against ONLY this list — there is no other path by which
// an external or unapproved URL could reach a client render.
const CTA_ROUTE_ALLOWLIST = [
  '/dashboard',
  '/coaching',
  '/train',
  '/account',
  '/mind-journal',
  '/self-talk',
  '/focus-deck',
  '/body-reset',
  '/body-reset/history',
  '/mental-rep',
  '/weekly-reviews',
  '/ritual',
  '/visualization',
  '/starting-profile',
  '/pricing',
];

function isValidCtaRoute(route) {
  return CTA_ROUTE_ALLOWLIST.includes(route);
}

// Never throws — malformed/missing JSON is just "no options".
function parseOptions(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Full server-side validation for a founder create payload. Client
// validation is never trusted alone. Returns { ok: true, data } with a
// clean, Prisma-ready `data` object, or { ok: false, error }.
function validateCommunicationInput(body) {
  const src = body || {};
  const { type, title, body: text, ctaRoute, ctaLabel, responseType, responseOptions } = src;

  if (type !== 'ANNOUNCEMENT' && type !== 'SURVEY') {
    return { ok: false, error: 'Invalid type' };
  }
  if (typeof title !== 'string' || !title.trim() || title.trim().length > MAX_TITLE_LEN) {
    return { ok: false, error: 'Invalid title' };
  }
  if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_BODY_LEN) {
    return { ok: false, error: 'Invalid body' };
  }

  let cleanCtaRoute = null;
  let cleanCtaLabel = null;
  if (ctaRoute !== undefined && ctaRoute !== null && ctaRoute !== '') {
    if (!isValidCtaRoute(ctaRoute)) return { ok: false, error: 'Invalid CTA route' };
    if (typeof ctaLabel !== 'string' || !ctaLabel.trim() || ctaLabel.trim().length > MAX_CTA_LABEL_LEN) {
      return { ok: false, error: 'Invalid CTA label' };
    }
    cleanCtaRoute = ctaRoute;
    cleanCtaLabel = ctaLabel.trim();
  }

  let cleanResponseType = null;
  let cleanOptionsJson = '[]';
  if (type === 'SURVEY') {
    if (!['YES_SOMEWHAT_NO', 'RATING_1_5', 'CUSTOM_SINGLE_CHOICE'].includes(responseType)) {
      return { ok: false, error: 'Invalid survey response type' };
    }
    cleanResponseType = responseType;
    if (responseType === 'CUSTOM_SINGLE_CHOICE') {
      if (!Array.isArray(responseOptions)) return { ok: false, error: 'Invalid survey options' };
      const trimmed = responseOptions
        .map((o) => (typeof o === 'string' ? o.trim() : ''))
        .filter(Boolean);
      if (trimmed.length < MIN_CUSTOM_OPTIONS || trimmed.length > MAX_CUSTOM_OPTIONS) {
        return { ok: false, error: `Custom survey needs ${MIN_CUSTOM_OPTIONS}-${MAX_CUSTOM_OPTIONS} options` };
      }
      if (trimmed.some((o) => o.length > MAX_OPTION_LEN)) {
        return { ok: false, error: 'Survey option too long' };
      }
      if (new Set(trimmed).size !== trimmed.length) {
        return { ok: false, error: 'Duplicate survey options' };
      }
      cleanOptionsJson = JSON.stringify(trimmed);
    }
  } else if (responseType !== undefined && responseType !== null && responseType !== '') {
    return { ok: false, error: 'Announcement cannot have a survey response type' };
  }

  return {
    ok: true,
    data: {
      type,
      title: title.trim(),
      body: text.trim(),
      ctaRoute: cleanCtaRoute,
      ctaLabel: cleanCtaLabel,
      responseType: cleanResponseType,
      responseOptions: cleanOptionsJson,
    },
  };
}

// Validates an athlete's submitted survey value against the SPECIFIC
// communication's own configured responseType/options. A value copied from
// a different survey (e.g. a custom option belonging to another
// communication) is rejected here because it is checked against THIS
// communication's own responseOptions, never a global list.
function validateResponseValue(communication, value) {
  if (typeof value !== 'string' || !value) return false;
  if (communication.responseType === 'YES_SOMEWHAT_NO') {
    return ['yes', 'somewhat', 'no'].includes(value);
  }
  if (communication.responseType === 'RATING_1_5') {
    return ['1', '2', '3', '4', '5'].includes(value);
  }
  if (communication.responseType === 'CUSTOM_SINGLE_CHOICE') {
    return parseOptions(communication.responseOptions).includes(value);
  }
  return false;
}

// Per-athlete status shown to the founder — derived purely from the
// Response row (or its absence, meaning "not seen"). responded is checked
// before dismissed, and dismissed before deferred, so a survey's terminal
// state (responded, or dismissed via the second "Not now") always wins over
// an earlier transient one.
function deriveAthleteStatus(response) {
  if (!response) return 'not_seen';
  if (response.respondedAt) return 'responded';
  if (response.dismissedAt) return 'dismissed';
  if (response.deferCount > 0) return 'deferred';
  if (response.seenAt) return 'seen';
  return 'not_seen';
}

// Whether a (communication, response-row-or-null) pair is still eligible to
// be shown to the athlete the response row belongs to. The one place this
// rule is expressed — shared by the athlete "next" query and this module's
// own tests.
function isEligible(communication, response) {
  if (!communication.isActive) return false;
  if (response?.dismissedAt) return false;
  if (response?.respondedAt) return false;
  return true;
}

module.exports = {
  MAX_TITLE_LEN,
  MAX_BODY_LEN,
  MAX_CTA_LABEL_LEN,
  MIN_CUSTOM_OPTIONS,
  MAX_CUSTOM_OPTIONS,
  MAX_OPTION_LEN,
  CTA_ROUTE_ALLOWLIST,
  isValidCtaRoute,
  parseOptions,
  validateCommunicationInput,
  validateResponseValue,
  deriveAthleteStatus,
  isEligible,
};
