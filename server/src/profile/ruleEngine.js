// Deterministic starting-profile rule engine (PR 3). Pure: given an
// OnboardingSession's raw answers it produces a language-independent rule
// output and can render cautious athlete-facing sections in EN/HI. No AI, no
// scores, no diagnosis. The AI wording layer may only rephrase renderSections
// output; it can never change what is supported here.

const C = require('../onboarding/config'); // server onboarding config (branches, resolveBranch)
const cfg = require('./ruleConfig');

const firstId = (a, qid) => a?.[qid]?.answerIds?.[0];
const selIds = (a, qid) => a?.[qid]?.answerIds || [];
const pick = (map, id, lang) => map[id]?.[lang];

function joinClauses(parts, lang) {
  const and = lang === 'hi' ? ' और ' : ' and ';
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return parts[0] + and + parts[1];
  return parts.slice(0, -1).join(', ') + ',' + and + parts[parts.length - 1];
}

// ── Canonical, language-independent rule output ─────────────────────────────
function buildRuleOutput(session) {
  const answers = session.answers || {};
  const branchId = session.branchId || C.resolveBranch(answers) || 'unsure';
  const priorityId = session.primaryPriorityId || firstId(answers, 'primary_priority') || null;

  const sportId = firstId(answers, 'sport') || null;
  const sport = sportId === 'other' ? (answers.sport?.customText || '') : (sportId || '');
  const goals = selIds(answers, 'broad_goals').slice(0, 3);
  const outcome = firstId(answers, 'four_week_outcome') || null;

  const branch = C.config.branches[branchId];
  const qids = (branch?.screenIds || []).flatMap((sid) => C.config.branchScreens[sid]?.questionIds || []);

  const reaction = [];
  const effect = [];
  let durationObs = null;
  let resilience = false;
  let onset = null;
  let stage = null;
  let source = null;

  for (const qid of qids) {
    const isDuration = qid.endsWith('_recovery') || qid.endsWith('_duration');
    const ids = selIds(answers, qid);
    if (isDuration) {
      const d = ids[0];
      if (cfg.PROLONGED_RECOVERY.has(d)) durationObs = { code: `${qid}:${d}`, dim: 'duration', questionId: qid, answerId: d };
      else if (cfg.QUICK_RECOVERY.has(d)) resilience = true;
      continue;
    }
    // Context questions describe the situation rather than a problem — they
    // are carried separately so they can ground §1/§2 without competing for
    // an observation slot.
    if (qid === 'pre_performance_onset') { onset = ids.find((id) => cfg.ONSET_PHRASE[id]) || null; continue; }
    if (qid === 'injury_stage') { stage = ids.find((id) => cfg.INJURY_STAGE[id]) || null; continue; }
    if (qid === 'family_outside_source') { source = ids.find((id) => cfg.FAMILY_SOURCE[id]) || null; continue; }

    for (const aid of ids) {
      if (cfg.NEUTRAL_ANSWERS.has(aid)) continue; // suppress no-problem answers
      const clause = cfg.CLAUSE[`${qid}:${aid}`];
      if (!clause) continue;
      const obs = { code: `${qid}:${aid}`, dim: clause.dim, questionId: qid, answerId: aid };
      (clause.dim === 'reaction' ? reaction : effect).push(obs);
    }
  }

  // Cap at 3, but reserve the last slot for duration when the athlete gave
  // one: how long it lasts is what makes the pattern recognisable to them,
  // and it used to be crowded out whenever three reactions/effects existed.
  const room = durationObs ? 2 : 3;
  const observations = [...reaction, ...effect].slice(0, room);
  if (durationObs) observations.push(durationObs);

  // The athlete's recognition (unsure branch) still names a situation, so a
  // profile is never left without one.
  const recognition = selIds(answers, 'unsure_recognition').find((id) => cfg.UNSURE_TRIGGER[id]) || null;
  // The athlete's own first real difficult moment, when no single priority
  // was chosen — still their answer, not an inference.
  const ownMoments = selIds(answers, 'difficult_moments').filter((id) => id !== 'not_sure' && id !== 'different');

  const contextual = selIds(answers, 'contextual_pressures')
    .filter((id) => cfg.CONTEXT_PHRASE[id])
    .slice(0, 1);

  return {
    ruleVersion: cfg.RULE_VERSION,
    branch: branchId,
    priorityId,
    suggestedPriorityId: priorityId || ownMoments[0] || 'not_sure',
    sportId,
    sport,
    role: firstId(answers, 'role_position') || null,
    goals,
    outcome,
    observations,
    resilience,
    onset,
    stage,
    source,
    recognition,
    strengths: selIds(answers, 'strengths').filter((id) => cfg.STRENGTH_PHRASE[id]).slice(0, 3),
    supports: selIds(answers, 'supports').filter((id) => cfg.SUPPORT_PHRASE[id]).slice(0, 2),
    contextual,
  };
}

// The situation this profile is about, named from the athlete's own answers.
// Order: chosen priority → their own first difficult moment → the pattern they
// recognised on the unsure branch. Only if all three are missing do we fall
// back, and even then we name the branch rather than "the moments you
// mentioned".
function situationPhrase(ro, L) {
  return pick(cfg.TRIGGER, ro.priorityId, L)
    || pick(cfg.TRIGGER, ro.suggestedPriorityId, L)
    || pick(cfg.UNSURE_TRIGGER, ro.recognition, L)
    // The custom branch means the athlete typed their own situation. We point
    // at it without repeating their words back to them here.
    || (ro.branch === 'custom' ? (L === 'hi' ? 'जो स्थिति आपने अपने शब्दों में लिखी, उसमें' : 'in the situation you wrote about in your own words') : null)
    // Nothing at all was named — cautious and sport-anchored, never "the
    // moments you mentioned".
    || (L === 'hi' ? 'खेल के दबाव वाले पलों में' : 'in the pressure moments of your sport');
}

// ── Deterministic rendered sections (cautious, EN/HI) ───────────────────────
function renderSections(ro, lang = 'en') {
  const L = lang === 'hi' ? 'hi' : 'en';

  const trigger = situationPhrase(ro, L);

  // §1 What matters to you — sport (+ role), goals, four-week outcome. Never a
  // "your sport means a lot to you"-style statement about what they feel.
  const sportLabel = pick(cfg.SPORT_LABEL, ro.sportId, L) || ro.sport || (L === 'hi' ? 'अपने खेल' : 'your sport');
  const roleLabel = pick(cfg.ROLE_LABEL, ro.role, L);
  const goalLabels = ro.goals.map((g) => pick(cfg.GOAL_LABEL, g, L)).filter(Boolean);
  const outcomeLabel = pick(cfg.OUTCOME_LABEL, ro.outcome, L);
  const stageLabel = pick(cfg.INJURY_STAGE, ro.stage, L);
  let whatMatters;
  if (L === 'hi') {
    whatMatters = roleLabel
      ? `जो आपने बताया, उससे: आप ${sportLabel} खेलते हैं, ${roleLabel} के तौर पर।`
      : `जो आपने बताया, उससे: आप ${sportLabel} खेलते हैं।`;
    if (stageLabel) whatMatters += ` अभी ${stageLabel}।`;
    if (goalLabels.length) whatMatters += ` आप ${joinClauses(goalLabels, L)} पर काम करना चाहते हैं।`;
    if (outcomeLabel) whatMatters += ` अगले चार हफ्तों में आप ${outcomeLabel} चाहते हैं।`;
    else whatMatters += ` अगले चार हफ्तों का लक्ष्य आपने अपने शब्दों में बताया — हम उसी से शुरू करेंगे।`;
  } else {
    whatMatters = roleLabel
      ? `From what you shared, you play ${sportLabel} as a ${roleLabel}.`
      : `From what you shared, you play ${sportLabel}.`;
    if (stageLabel) whatMatters += ` Right now, ${stageLabel}.`;
    if (goalLabels.length) whatMatters += ` You'd like to work on ${joinClauses(goalLabels, L)}.`;
    if (outcomeLabel) whatMatters += ` Over the next four weeks, you want to ${outcomeLabel}.`;
    else whatMatters += ` You set your own four-week goal in your own words — that's what we'll work towards.`;
  }

  // §2 A possible pattern — names the situation explicitly, then the
  // reactions/effects the athlete selected, then how long it lasts.
  // On the unsure branch the situation itself is derived from a recognition
  // answer, so that answer's clause would repeat it — drop it, but only when
  // something else is left to say.
  const usedAsSituation = !pick(cfg.TRIGGER, ro.priorityId, L) && !pick(cfg.TRIGGER, ro.suggestedPriorityId, L) && ro.recognition
    ? `unsure_recognition:${ro.recognition}`
    : null;
  // Only drop it when another reaction/effect survives — a duration clause on
  // its own would leave the pattern with nothing the athlete recognises.
  let shown = ro.observations;
  if (usedAsSituation && shown.some((o) => o.dim !== 'duration' && o.code !== usedAsSituation)) {
    shown = shown.filter((o) => o.code !== usedAsSituation);
  }
  const obsClauses = shown.map((o) => (o.dim === 'duration' ? cfg.DURATION_PROLONGED[L] : cfg.CLAUSE[o.code]?.[L])).filter(Boolean);
  const onsetLabel = pick(cfg.ONSET_PHRASE, ro.onset, L);
  const sourceLabel = pick(cfg.FAMILY_SOURCE, ro.source, L);
  const contextLabel = pick(cfg.CONTEXT_PHRASE, ro.contextual[0], L);
  let possiblePattern;
  if (obsClauses.length === 0) {
    possiblePattern = L === 'hi'
      ? `एक शुरुआती समझ के तौर पर, ${trigger} आप इसे काफी संभले हुए तरीके से संभालते दिखते हैं। हम इसे साथ में और समझ सकते हैं।`
      : `As a starting understanding, ${trigger} you seem to handle it fairly steadily. We can still explore it together.`;
  } else {
    possiblePattern = L === 'hi'
      ? `एक संभावित पैटर्न यह हो सकता है कि ${trigger} ${joinClauses(obsClauses, L)}।`
      : `One possible pattern is that ${trigger}, ${joinClauses(obsClauses, L)}.`;
    if (onsetLabel) possiblePattern += L === 'hi' ? ` आपने बताया कि ${onsetLabel}।` : ` You said ${onsetLabel}.`;
    if (sourceLabel) possiblePattern += L === 'hi' ? ` यह दबाव ज़्यादातर ${sourceLabel} आता है।` : ` That expectation comes mostly ${sourceLabel}.`;
    if (ro.resilience) possiblePattern += ` ${cfg.RESILIENCE_NOTE[L]}.`;
    possiblePattern += L === 'hi'
      ? ' यह सिर्फ एक शुरुआती समझ है, जिसे हम साथ में जाँच सकते हैं।'
      : ' This is only a starting understanding, and we can explore it together.';
  }
  if (contextLabel) {
    possiblePattern += L === 'hi'
      ? ` आपने यह भी बताया कि ${contextLabel} इसके आसपास रहती है।`
      : ` You also mentioned ${contextLabel} sitting around this.`;
  }

  // §3 What already helps — the athlete's own supports and strengths. Only
  // when they named none do we fall back, and that fallback still names their
  // situation rather than saying nothing at all.
  const supportLabels = ro.supports.map((s) => pick(cfg.SUPPORT_PHRASE, s, L)).filter(Boolean);
  const strengthLabels = ro.strengths.map((s) => pick(cfg.STRENGTH_PHRASE, s, L)).filter(Boolean);
  let whatHelps;
  if (supportLabels.length === 0 && strengthLabels.length === 0) {
    whatHelps = cfg.NOTHING_NAMED_YET[L](trigger);
  } else {
    whatHelps = '';
    if (supportLabels.length) whatHelps += L === 'hi'
      ? `${joinClauses(supportLabels, L)} आपके लिए पहले से मददगार लगते हैं।`
      : `${cap(joinClauses(supportLabels, L))} already seem useful for you.`;
    if (strengthLabels.length) whatHelps += (whatHelps ? ' ' : '') + (L === 'hi'
      ? `आपने खुद को ${joinClauses(strengthLabels, L)} भी बताया।`
      : `You also described yourself as ${joinClauses(strengthLabels, L)}.`);
  }

  // §4 Where we can begin — one specific conversation focus, built from the
  // situation onboarding already established. Never asks Arjun (or the
  // athlete) to work out which situation matters, and prescribes nothing.
  const beginArea = pick(cfg.BEGIN, ro.branch, L);
  let whereWeBegin;
  if (L === 'hi') {
    whereWeBegin = `हम एक हाल के पल से शुरू कर सकते हैं जब ${trigger} ऐसा हुआ`;
    whereWeBegin += beginArea ? `, और ${beginArea} को साथ में देख सकते हैं।` : '।';
    whereWeBegin += ' यह अभी कोई तय अभ्यास नहीं है।';
  } else {
    whereWeBegin = `We can begin with one recent moment ${trigger}`;
    whereWeBegin += beginArea ? `, and look together at ${beginArea}.` : '.';
    whereWeBegin += ' This is not a fixed practice yet.';
  }

  return { whatMatters, possiblePattern, whatHelps, whereWeBegin };
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ── Grounding anchors ───────────────────────────────────────────────────────
// The specifics an AI rewrite must keep. Each group is a set of alternative
// tokens drawn from the athlete's own answers; a rewrite that drops a whole
// group has genericised the profile and is rejected in favour of the
// deterministic wording. Matching is on a short stem so ordinary rephrasing
// ("preparation" → "preparing") still passes.

const STOPWORDS = new Set([
  'your', 'after', 'with', 'that', 'this', 'when', 'they', 'them', 'from', 'into', 'more',
  'most', 'than', 'what', 'which', 'have', 'been', 'will', 'some', 'just', 'about', 'their',
  'yourself', 'already', 'seem', 'seems', 'much', 'over', 'next', 'four', 'weeks', 'want',
  'like', 'work', 'play', 'said', 'also', 'come', 'comes', 'sits', 'around', 'these', 'those',
]);
const STEM_LEN = 5;

function keyTokens(phrase) {
  const words = String(phrase || '')
    .toLowerCase()
    // \p{M} keeps Devanagari matras attached — without it Hindi words split
    // into fragments too short to anchor on, and Hindi rewrites go unchecked.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  // Longest words carry the most meaning; two alternatives is enough.
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 2).map((w) => w.slice(0, STEM_LEN));
}

function groundingAnchors(ro, lang = 'en') {
  const L = lang === 'hi' ? 'hi' : 'en';
  const groups = [];
  const add = (group, phrases) => {
    const tokens = [...new Set(phrases.filter(Boolean).flatMap(keyTokens))];
    if (tokens.length) groups.push({ group, tokens });
  };

  add('sport', [pick(cfg.SPORT_LABEL, ro.sportId, L) || ro.sport]);
  add('situation', [situationPhrase(ro, L)]);
  add('pattern', ro.observations.map((o) => (o.dim === 'duration' ? cfg.DURATION_PROLONGED[L] : cfg.CLAUSE[o.code]?.[L])));
  add('goal', [pick(cfg.OUTCOME_LABEL, ro.outcome, L), ...ro.goals.map((g) => pick(cfg.GOAL_LABEL, g, L))]);
  add('helps', [
    ...ro.supports.map((s) => pick(cfg.SUPPORT_PHRASE, s, L)),
    ...ro.strengths.map((s) => pick(cfg.STRENGTH_PHRASE, s, L)),
  ]);
  return groups;
}

// True when every anchor group still has at least one of its tokens in the text.
function isGrounded(text, anchors = []) {
  const joined = String(text || '').toLowerCase();
  return anchors.every((a) => a.tokens.some((t) => joined.includes(t)));
}

// Prohibited-claim check reused by the AI wording validator.
function hasProhibited(text) {
  if (typeof text !== 'string') return false;
  return cfg.PROHIBITED_PATTERNS.some((re) => re.test(text));
}

// Total word count across the four sections (used for the length cap).
function wordCount(sections) {
  return ['whatMatters', 'possiblePattern', 'whatHelps', 'whereWeBegin']
    .map((k) => (sections[k] || '').trim().split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
}

module.exports = {
  buildRuleOutput, renderSections, hasProhibited, wordCount,
  situationPhrase, groundingAnchors, isGrounded,
  RULE_VERSION: cfg.RULE_VERSION,
};
