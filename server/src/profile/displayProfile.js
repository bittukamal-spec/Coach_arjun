// Server-owned presentation object for the Performance Profile screen.
//
// Purpose: the client renders strings and stable ids, and never maps a raw
// onboarding answer to a label or decides what an observation means. Every
// psychological word on the page is authored here or in the existing wording
// rows — this file adds no new conclusion of any kind.
//
// Inputs are all ALREADY STORED:
//   - profile.ruleOutput          frozen canonical rule output (never rebuilt)
//   - session.answers             the linked completed OnboardingSession
//   - wording.sections            existing EN/HI wording row
//   - profile.agreedPriorityId    the athlete's confirmed/corrected priority
//   - focusRow                    CurrentCoachingFocus, may be absent
//
// Pure: no I/O, no Anthropic call, no writes. Calling it cannot regenerate or
// mutate anything. Missing data is omitted rather than faked — no "Unknown",
// no placeholder, no invented value.

const cfg = require('./ruleConfig');
const C = require('../onboarding/config');
const { situationPhrase } = require('./ruleEngine');
const { sanitizeCustomText } = require('../onboarding/sanitize');
const { resolveCurrentFocus, focusLabel } = require('./currentFocus');

const CUSTOM_SNAPSHOT_MAX = 60;

const pick = (map, id, L) => (id ? map[id]?.[L] : null) || null;
const firstId = (answers, qid) => answers?.[qid]?.answerIds?.[0] || null;
const customOf = (answers, qid) => answers?.[qid]?.customText || '';

// SUPPORT_PHRASE / STRENGTH_PHRASE are written as mid-sentence fragments
// ("a routine before you perform", "hard-working") because the prose sections
// embed them in a sentence. A chip is not a sentence, so drop a leading
// article and capitalise. Presentation only — the underlying phrase, and
// therefore the rule engine's conclusion, is unchanged.
const LEADING_ARTICLE = /^(a|an|the) /i;
function chipLabel(text, L) {
  const s = String(text || '').trim();
  if (!s) return null;
  const stripped = L === 'hi' ? s : s.replace(LEADING_ARTICLE, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// Sanitised at read time as defence in depth: onboarding already sanitises on
// write, but rows stored before that path existed must not reach the client
// carrying markup.
function safeCustom(text) {
  return sanitizeCustomText(text || '', CUSTOM_SNAPSHOT_MAX) || null;
}

// ── Snapshot: purely factual, all directly athlete-reported ────────────────
function buildSnapshot(ruleOutput, answers, L) {
  const sport = chipLabel(pick(cfg.SPORT_LABEL, ruleOutput.sportId, L), L)
    || (ruleOutput.sportId === 'other' ? chipLabel(safeCustom(ruleOutput.sport), L) : null);

  // `both` → "Multiple roles"; none/unsure/different carry nothing
  // displayable, so the chip is omitted. A custom role is shown from the
  // onboarding answer, which is the only place its text exists.
  let role = chipLabel(pick(cfg.ROLE_LABEL, ruleOutput.role, L), L);
  if (!role && ruleOutput.role === 'different') role = chipLabel(safeCustom(customOf(answers, 'role_position')), L);

  // Competition level and experience are separate chips, each independently
  // omitted when absent — so a missing one never leaves an empty or confusing
  // card, and neither is padded to fill a slot.
  //
  // The mockup also shows a "3–5 years" chip. Onboarding has no
  // years-of-experience question (competition_level is recreational…
  // international; experience_level is beginner/amateur/competitive/
  // professional), so there is nothing to render it from and it is
  // deliberately omitted rather than fabricated.
  const levelId = firstId(answers, 'competition_level');
  const playingContext = pick(cfg.LEVEL_LABEL, levelId, L)
    || (levelId === 'other' ? safeCustom(customOf(answers, 'competition_level')) : null);
  const experience = pick(cfg.EXPERIENCE_LABEL, firstId(answers, 'experience_level'), L);

  const goals = (ruleOutput.goals || [])
    .map((id) => ({ id, label: chipLabel(pick(cfg.GOAL_LABEL, id, L), L) }))
    .filter((g) => g.label);

  // `own_goal` means the athlete wrote their own four-week goal; the text is
  // not part of ruleOutput, so we acknowledge it without inventing wording.
  const outcomeLabel = chipLabel(pick(cfg.OUTCOME_LABEL, ruleOutput.outcome, L), L);
  const fourWeekOutcome = outcomeLabel
    || (ruleOutput.outcome === 'own_goal'
      ? (L === 'hi' ? 'आपका अपना लक्ष्य' : 'Your own goal')
      : null);

  return { sport, role, playingContext, experience, goals, fourWeekOutcome };
}

// ── Starting pattern: the frozen onboarding baseline ──────────────────────
// Nodes come straight from the stored observations, in stored order. The rule
// engine already built that array as [...reaction, ...effect] with any
// duration observation appended last, so the pathway is a render of a
// decision already made — not a new one. A node whose clause is missing from
// config is dropped rather than shown as a raw id.
const NODE_KIND = { reaction: 'reaction', effect: 'effect', duration: 'duration' };

// Node-kind labels shown above each step ("Situation", "Reaction", …). These
// name the KIND of step, not the athlete — pure UI vocabulary, server-owned so
// the client never has to decide what a `dim` means.
const NODE_LABEL = {
  situation: { en: 'Situation', hi: 'स्थिति' },
  reaction:  { en: 'Reaction', hi: 'प्रतिक्रिया' },
  effect:    { en: 'Performance effect', hi: 'खेल पर असर' },
  duration:  { en: 'Duration', hi: 'कितनी देर' },
};

function buildStartingPattern(ruleOutput, L) {
  const situation = situationPhrase(ruleOutput, L);
  const nodes = [{ type: 'situation', label: NODE_LABEL.situation[L], text: situation }];

  for (const obs of ruleOutput.observations || []) {
    const type = NODE_KIND[obs.dim];
    if (!type) continue;
    // A custom "something else" answer carries its own verbatim text on the
    // observation (set once, in ruleEngine.js, when it was first recorded) —
    // shown exactly as the athlete wrote it, never relabelled "Something
    // else" and never run through CLAUSE, which only knows fixed phrasings.
    const text = obs.customText || (type === 'duration' ? cfg.DURATION_PROLONGED[L] : cfg.CLAUSE[obs.code]?.[L]);
    if (!text) continue;
    nodes.push({ type, label: NODE_LABEL[type][L], text, code: obs.code });
  }

  const notes = [];
  if (ruleOutput.resilience) notes.push({ kind: 'resilience', text: cfg.RESILIENCE_NOTE[L] });
  const context = pick(cfg.CONTEXT_PHRASE, (ruleOutput.contextual || [])[0], L);
  if (context) notes.push({ kind: 'context', text: context });
  const onset = pick(cfg.ONSET_PHRASE, ruleOutput.onset, L);
  if (onset) notes.push({ kind: 'onset', text: onset });
  const stage = pick(cfg.INJURY_STAGE, ruleOutput.stage, L);
  if (stage) notes.push({ kind: 'stage', text: stage });
  const source = pick(cfg.FAMILY_SOURCE, ruleOutput.source, L);
  if (source) notes.push({ kind: 'source', text: source });

  return { situation, nodes, notes };
}

// ── When Pressure Hits: the athlete's OWN answers, unrewritten ────────────
// Structured ids + verbatim custom text only. No CLAUSE, no phrasing, no
// interpretation: the client resolves each answer id to the SAME athlete-
// facing label the question itself showed, so what the profile says is exactly
// what the athlete tapped.
//
// `status` per stage:
//   'set'       — a usable answer (one id, or a multi-select's ids)
//   'unset'     — nothing stored: the client shows "Not set yet"
//   'ambiguous' — a single-choice question carrying >1 stored ids (an athlete
//                 who answered before it became single-choice). Never resolved
//                 here by picking one — the client shows "Needs update" and the
//                 edit flow makes the athlete choose.
function rawAnswer(answers, questionId) {
  const q = C.getQuestion(questionId);
  const stored = answers?.[questionId] || {};
  const answerIds = Array.isArray(stored.answerIds) ? stored.answerIds : [];
  const hasCustom = answerIds.some((id) => C.isCustom(questionId, id));
  const customText = hasCustom ? safeCustom(stored.customText) : null;

  let status = 'set';
  if (answerIds.length === 0) status = 'unset';
  else if (q?.type === 'single' && answerIds.length > 1) status = 'ambiguous';
  else if (hasCustom && !customText && answerIds.length === 1) status = 'unset';

  return { questionId, answerIds, customText, status };
}

function buildPressure(session, branchId) {
  const answers = session?.answers || {};
  const stages = C.pressureStages(branchId).map(({ stage, questionId }) => ({
    stage,
    ...rawAnswer(answers, questionId),
  }));
  return { branchId, stages };
}

// The other athlete-answered sections the profile shows verbatim: what helps,
// strengths, and the goals the athlete set. Same contract as the pressure
// stages — ids + custom text, never a phrasing of them.
function buildRawSelections(session) {
  const answers = session?.answers || {};
  return {
    supports: rawAnswer(answers, 'supports'),
    strengths: rawAnswer(answers, 'strengths'),
    broadGoals: rawAnswer(answers, 'broad_goals'),
    fourWeekOutcome: rawAnswer(answers, 'four_week_outcome'),
  };
}

// ── What already helps: athlete-selected supports + strengths ─────────────
// The rule engine has already filtered these to ids it can phrase (dropping
// `havent_noticed`, `still_figuring`, `different`), so nothing unselected or
// unphraseable can appear. Never scored, never ranked.
function buildHelps(ruleOutput, L) {
  const supports = (ruleOutput.supports || [])
    .map((id) => ({ id, label: chipLabel(pick(cfg.SUPPORT_PHRASE, id, L), L) }))
    .filter((s) => s.label);
  const strengths = (ruleOutput.strengths || [])
    .map((id) => ({ id, label: chipLabel(pick(cfg.STRENGTH_PHRASE, id, L), L) }))
    .filter((s) => s.label);
  return { supports, strengths };
}

// The one entry point. `focusRow` may be null (existing athletes).
function buildDisplayProfile({ profile, session, wording, focusRow = null, language } = {}) {
  const L = language === 'hi' ? 'hi' : 'en';
  const ruleOutput = profile?.ruleOutput || {};
  const answers = session?.answers || {};
  const sections = wording?.sections || {};
  // Stored branch first (set on every save), then re-resolved for rows written
  // before that column existed. `unsure` is the config's own shallow branch.
  const branchId = session?.branchId || C.resolveBranch(answers) || 'unsure';

  const { supports, strengths } = buildHelps(ruleOutput, L);

  return {
    // Mutable. Null before the athlete has confirmed the profile — the page
    // shows the SUGGESTED starting focus in that mode instead.
    currentFocus: resolveCurrentFocus({ focusRow, profile, ruleOutput, language: L }),

    // The suggested focus, so first-time mode has a server-authored label
    // without the client mapping suggestedPriorityId itself.
    suggestedFocus: profile?.suggestedPriorityId
      ? {
        id: profile.suggestedPriorityId,
        label: focusLabel(profile.suggestedPriorityId, null, L),
      }
      : null,

    snapshot: buildSnapshot(ruleOutput, answers, L),
    startingPattern: buildStartingPattern(ruleOutput, L),
    supports,
    strengths,

    // ── Athlete-readable coaching context (what the Profile screen shows) ──
    // Raw structured answers. The rule engine still runs and still feeds
    // Coach; it just no longer speaks for the athlete on their own profile.
    pressure: buildPressure(session, branchId),
    selections: buildRawSelections(session),

    // Existing wording rows, verbatim. No AI call, no new generation.
    interpretation: sections.possiblePattern || null,
    nextStep: sections.whereWeBegin || null,
    // Kept so the redesign can fall back to prose if a section is ever empty.
    whatMattersText: sections.whatMatters || null,
    whatHelpsText: sections.whatHelps || null,

    fitStatus: profile?.fitResponse || null,
    generatedAt: profile?.generatedAt || null,
    updatedAt: profile?.updatedAt || null,
  };
}

module.exports = { buildDisplayProfile, buildSnapshot, buildStartingPattern, buildHelps, buildPressure, buildRawSelections, rawAnswer };
