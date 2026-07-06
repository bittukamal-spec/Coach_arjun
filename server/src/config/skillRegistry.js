// Central registry of the six mental-performance skills the chat
// recommendation loop can identify and act on. Each skill maps to tag ids
// from client/src/utils/parseArjunMessage.js's APP_TOOL_CONFIG — that file
// (and its ACTIVE_TOOL_ROUTES guardrail) remains the single source of truth
// for "is this actually a real, clickable tool." This registry only decides
// WHICH tag to reach for given a detected skill and what's known about the
// athlete; it never introduces a route of its own.
//
// Do not add a skill here without also adding real tools for it in
// APP_TOOL_CONFIG. Do not point any skill at a removed tool (Before You
// Play, Bounce Back, the standalone Breathing / Calm Body tool — folded
// into Pressure Reset / body-reset).

const SKILL_REGISTRY = {
  focus_self_talk: {
    skillKey: 'focus_self_talk',
    name: 'Focus / Focus Words',
    explanation: 'Bringing your mind back to one focus word when it wanders or turns negative.',
    // Resolved dynamically: 'self-talk' if no active focus card, 'focus-lock' if one exists.
    tools: ['self-talk', 'focus-lock'],
    route: '/self-talk',
    whenToRecommend: 'focus, overthinking, negative self-talk, wanting a cue word, a drop in confidence tied to focus, mind wandering, losing focus during training',
    whenNotToRecommend: 'urgent safety/distress signals, or the athlete is just acknowledging (thanks/ok) with nothing to act on',
  },
  calm_body: {
    skillKey: 'calm_body',
    name: 'Pressure Reset',
    explanation: 'When pressure rises, your body reacts first. Pressure Reset helps you steady your body and return to the next action.',
    tools: ['body-reset'],
    route: '/body-reset',
    whenToRecommend: 'nervous, tense, rushed, pressure, breathing fast, tight body, overloaded, panic before training or competition',
    whenNotToRecommend: 'urgent safety/distress signals (those override everything and get a real support response, not a tool card)',
  },
  reflection: {
    skillKey: 'reflection',
    name: 'Reflection',
    explanation: 'Turning a session into one clear, honest takeaway instead of just moving on or dwelling.',
    tools: ['after-the-match'],
    route: '/debrief',
    whenToRecommend: 'bad training, after a performance, not improving, not knowing what went wrong, coach feedback, a poor session',
    whenNotToRecommend: 'the athlete is mid-competition or about to perform, not after it',
  },
  visualization: {
    skillKey: 'visualization',
    name: 'Visualization',
    explanation: 'Mentally rehearsing a specific moment before it happens so the body already knows what to do.',
    tools: ['visualization'],
    route: '/visualization',
    whenToRecommend: 'preparing for training or competition, wanting confidence before a specific situation, rehearsing a skill, imagining performance',
    whenNotToRecommend: 'the athlete just finished and wants to reflect (that is reflection, not visualization)',
  },
  mistake_reset: {
    skillKey: 'mistake_reset',
    name: 'Mistake Reset',
    explanation: 'Resetting after an error so one mistake does not turn into several.',
    // Prefer reset-rally for practice; self-talk if they need a reset phrase; body-reset if very tense.
    tools: ['reset-rally', 'self-talk', 'body-reset'],
    route: '/games/reset-rally',
    whenToRecommend: 'a mistake, frustration after an error, not being able to move on, one mistake snowballing into more',
    whenNotToRecommend: 'never as "Bounce Back" — that tool is retired; use reset-rally, self-talk, or body-reset only',
  },
  confidence: {
    skillKey: 'confidence',
    name: 'Confidence',
    explanation: 'Building belief in yourself through a concrete cue or mental rehearsal, not just reassurance.',
    tools: ['self-talk', 'visualization'],
    route: '/self-talk',
    whenToRecommend: 'low confidence, fear of failure, comparing yourself to others, self-doubt',
    whenNotToRecommend: 'the doubt is about a specific safety concern (injury, wellbeing) rather than performance confidence',
  },
};

const VALID_SKILL_KEYS = Object.keys(SKILL_REGISTRY);

function getSkill(skillKey) {
  return SKILL_REGISTRY[skillKey] || null;
}

// Resolve a detected skill + what's known about the athlete into one
// concrete APP_TOOL_CONFIG tag id. Never returns a tag outside the
// skill's own `tools` list, so it can't drift from the registry above.
function resolveTagForSkill(skillKey, { hasActiveFocusCard = false, quickCheckPassed = true } = {}) {
  if (skillKey === 'focus_self_talk') {
    // First-time athletes go through the Learn → Quick Check path before
    // either building a cue or practising one — never straight to the
    // tool/game itself.
    if (!quickCheckPassed) return 'skill-focus-self-talk';
    return hasActiveFocusCard ? 'focus-lock' : 'self-talk';
  }
  if (skillKey === 'calm_body') {
    // Same Learn → Quick Check gate as focus_self_talk, ahead of the
    // Pressure Reset tool itself.
    if (!quickCheckPassed) return 'skill-pressure-reset';
    return 'body-reset';
  }
  const skill = getSkill(skillKey);
  return skill ? skill.tools[0] : null;
}

module.exports = { SKILL_REGISTRY, VALID_SKILL_KEYS, getSkill, resolveTagForSkill };
