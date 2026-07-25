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

  for (const qid of qids) {
    const isDuration = qid.endsWith('_recovery') || qid.endsWith('_duration');
    const ids = selIds(answers, qid);
    if (isDuration) {
      const d = ids[0];
      if (cfg.PROLONGED_RECOVERY.has(d)) durationObs = { code: `${qid}:${d}`, dim: 'duration', questionId: qid, answerId: d };
      else if (cfg.QUICK_RECOVERY.has(d)) resilience = true;
      continue;
    }
    for (const aid of ids) {
      if (cfg.NEUTRAL_ANSWERS.has(aid)) continue; // suppress no-problem answers
      const clause = cfg.CLAUSE[`${qid}:${aid}`];
      if (!clause) continue;
      const obs = { code: `${qid}:${aid}`, dim: clause.dim, questionId: qid, answerId: aid };
      (clause.dim === 'reaction' ? reaction : effect).push(obs);
    }
  }

  // Cap at 3 with precedence reaction > effect > duration.
  let observations = [...reaction, ...effect];
  if (durationObs) observations.push(durationObs);
  observations = observations.slice(0, 3);

  const contextual = selIds(answers, 'contextual_pressures')
    .filter((id) => id !== 'nothing_outside' && id !== 'different')
    .slice(0, 1);

  return {
    ruleVersion: cfg.RULE_VERSION,
    branch: branchId,
    priorityId,
    suggestedPriorityId: priorityId || firstId(answers, 'difficult_moments') || 'not_sure',
    sportId,
    sport,
    role: firstId(answers, 'role_position') || null,
    goals,
    outcome,
    observations,
    resilience,
    strengths: selIds(answers, 'strengths').filter((id) => cfg.STRENGTH_PHRASE[id]).slice(0, 3),
    supports: selIds(answers, 'supports').filter((id) => cfg.SUPPORT_PHRASE[id]).slice(0, 2),
    contextual,
  };
}

// ── Deterministic rendered sections (cautious, EN/HI) ───────────────────────
function renderSections(ro, lang = 'en') {
  const L = lang === 'hi' ? 'hi' : 'en';

  // §1 What matters to you
  const sportLabel = pick(cfg.SPORT_LABEL, ro.sportId, L) || ro.sport || (L === 'hi' ? 'अपने खेल' : 'your sport');
  const goalLabels = ro.goals.map((g) => pick(cfg.GOAL_LABEL, g, L)).filter(Boolean);
  const outcomeLabel = pick(cfg.OUTCOME_LABEL, ro.outcome, L);
  let whatMatters;
  if (L === 'hi') {
    whatMatters = `जो आपने बताया, उससे: आप ${sportLabel} खेलते हैं।`;
    if (goalLabels.length) whatMatters += ` आप ${joinClauses(goalLabels, L)} पर काम करना चाहते हैं।`;
    if (outcomeLabel) whatMatters += ` अगले चार हफ्तों में आप ${outcomeLabel} चाहते हैं।`;
  } else {
    whatMatters = `From what you shared, you play ${sportLabel}.`;
    if (goalLabels.length) whatMatters += ` You'd like to work on ${joinClauses(goalLabels, L)}.`;
    if (outcomeLabel) whatMatters += ` Over the next four weeks, you want to ${outcomeLabel}.`;
  }

  // §2 A possible pattern
  const trigger = pick(cfg.TRIGGER, ro.priorityId, L)
    || (ro.branch === 'unsure'
      ? (L === 'hi' ? 'जिन पलों को आपने चुना, उनमें' : 'in the moments you flagged')
      : (L === 'hi' ? 'जो स्थिति आपने बताई, उसमें' : 'in the situation you described'));
  const obsClauses = ro.observations.map((o) => (o.dim === 'duration' ? cfg.DURATION_PROLONGED[L] : cfg.CLAUSE[o.code]?.[L])).filter(Boolean);
  let possiblePattern;
  if (obsClauses.length === 0) {
    possiblePattern = L === 'hi'
      ? `एक शुरुआती समझ के तौर पर, ${trigger} आप इसे काफी संभले हुए तरीके से संभालते दिखते हैं। हम इसे साथ में और समझ सकते हैं।`
      : `As a starting understanding, ${trigger} you seem to handle it fairly steadily. We can still explore it together.`;
  } else {
    possiblePattern = L === 'hi'
      ? `एक संभावित पैटर्न यह हो सकता है कि ${trigger} ${joinClauses(obsClauses, L)}।`
      : `One possible pattern is that ${trigger}, ${joinClauses(obsClauses, L)}.`;
    if (ro.resilience) possiblePattern += ` ${cfg.RESILIENCE_NOTE[L]}.`;
    possiblePattern += L === 'hi'
      ? ' यह सिर्फ एक शुरुआती समझ है, जिसे हम साथ में जाँच सकते हैं।'
      : ' This is only a starting understanding, and we can explore it together.';
  }

  // §3 What already helps
  const supportLabels = ro.supports.map((s) => pick(cfg.SUPPORT_PHRASE, s, L)).filter(Boolean);
  const strengthLabels = ro.strengths.map((s) => pick(cfg.STRENGTH_PHRASE, s, L)).filter(Boolean);
  let whatHelps;
  if (supportLabels.length === 0 && strengthLabels.length === 0) {
    whatHelps = L === 'hi'
      ? 'जैसे-जैसे हम बात करेंगे, हम देखेंगे कि आपके लिए पहले से क्या काम करता है।'
      : "As we talk, we'll notice what already works well for you.";
  } else {
    whatHelps = '';
    if (supportLabels.length) whatHelps += L === 'hi'
      ? `${joinClauses(supportLabels, L)} आपके लिए पहले से मददगार लगते हैं।`
      : `${cap(joinClauses(supportLabels, L))} already seem useful for you.`;
    if (strengthLabels.length) whatHelps += (whatHelps ? ' ' : '') + (L === 'hi'
      ? `आपने खुद को ${joinClauses(strengthLabels, L)} भी बताया।`
      : `You also described yourself as ${joinClauses(strengthLabels, L)}.`);
  }

  // §4 Where we can begin
  const beginArea = pick(cfg.BEGIN, ro.branch, L) || (L === 'hi' ? 'जो सबसे ज़रूरी लगे' : 'what feels most important');
  const whereWeBegin = L === 'hi'
    ? `हम ${beginArea} को समझने से शुरू कर सकते हैं। यह अभी कोई तय अभ्यास नहीं है।`
    : `We can begin by understanding ${beginArea}. This is not a fixed practice yet.`;

  return { whatMatters, possiblePattern, whatHelps, whereWeBegin };
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

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

module.exports = { buildRuleOutput, renderSections, hasProhibited, wordCount, RULE_VERSION: cfg.RULE_VERSION };
