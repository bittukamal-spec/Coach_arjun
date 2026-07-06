// Lightweight, rule-based intent detection for the chat recommendation
// loop. Deliberately simple for MVP — broad, natural keyword groups, no
// ML/embedding call. Runs on the raw user message before the LLM call so
// the system prompt can be primed with a specific, personalized tool
// suggestion instead of a generic one.

const SKILL_KEYWORDS = {
  focus_self_talk: [
    'focus', 'distracted', 'distraction', 'overthink', 'over think',
    'mind wander', 'mind wanders', 'wandering', 'thinking too much',
    'cue', 'concentration', 'concentrate', 'attention', 'practicing',
    'nets', 'drills',
  ],
  calm_body: [
    'nervous', 'tense', 'tight', 'panic', 'pressure', 'rushing', 'rushed',
    'breathing fast', 'breathing gets fast', 'fast breathing', 'shaky',
    'anxious', 'overloaded',
  ],
  reflection: [
    'bad session', 'bad training', 'not improving', 'what went wrong',
    'after training', 'after match', 'coach feedback', 'poor session',
  ],
  mistake_reset: [
    'mistake', 'error', 'messed up', 'dropped', 'missed', 'lost point',
    'angry after', "can't move on", 'cant move on', 'keep thinking about it',
  ],
  confidence: [
    'confidence', 'scared', 'doubt', 'failure', 'not good enough',
    'comparison', 'compare myself', 'selected', 'trials',
  ],
  visualization: [
    'imagine', 'visualize', 'visualise', 'rehearse', 'prepare',
    'before training', 'before competition', 'before trials',
    'picture myself', 'picture my',
  ],
};

// Short acknowledgement-only messages never trigger a recommendation,
// regardless of keyword overlap (there won't be any, but this is an
// explicit belt-and-braces check called out by the product spec).
const ACK_ONLY = /^(ok|okay|thanks|thank you|thx|sure|cool|got it|alright|k|yes|no|noted)[.!]?$/i;

// Order matters: the first matching group wins when a message could
// plausibly match more than one broad keyword list. calm_body must be
// checked before visualization (e.g. "nervous before training" should
// win as calm_body, not visualization's generic "before training").
// visualization must be checked before confidence (e.g. "imagine ...
// before trials" should win as visualization, not confidence's "trials").
const SKILL_ORDER = ['mistake_reset', 'reflection', 'calm_body', 'visualization', 'confidence', 'focus_self_talk'];

function detectSkill(message) {
  const text = (message || '').trim().toLowerCase();
  if (!text || ACK_ONLY.test(text)) return null;

  for (const skillKey of SKILL_ORDER) {
    const keywords = SKILL_KEYWORDS[skillKey];
    if (keywords.some(kw => text.includes(kw))) return skillKey;
  }
  return null;
}

module.exports = { detectSkill, SKILL_KEYWORDS };
