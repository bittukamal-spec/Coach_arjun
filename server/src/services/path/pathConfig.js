// Learning path — the chapters and how each step is recognised
// (docs/PATH-STRATEGY.md). Words for athletes live in the client
// (translations `path`); this file holds only keys and rules.

const CHAPTERS = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
const STEPS = ['learn', 'practise', 'play', 'reflect'];
// Levels (founder, Nov 2026): every chapter has 3 levels of the same 4 steps,
// each a bit harder (1 Basics · 2 In the match · 3 Big pressure). Level 1 is
// stored under the plain chapter key, so older progress keeps working; higher
// levels are stored as "focus:2", "focus:3" (no schema change).
const LEVELS = [1, 2, 3];
const levelKey = (chapterKey, level = 1) => (Number(level) > 1 ? `${chapterKey}:${Number(level)}` : chapterKey);
function parseLevelKey(stored) {
  const m = /^([a-z]+)(?::([23]))?$/.exec(String(stored || ''));
  return m ? { chapterKey: m[1], level: m[2] ? Number(m[2]) : 1 } : null;
}

// Which chapter comes first, from the athlete's starting-profile priority
// (server/src/profile/ruleConfig.js PRIORITY_PHRASE ids). Unknown → calm.
const PRIORITY_TO_CHAPTER = {
  before_important_performance: 'calm',
  pressure_increases: 'calm',
  family_expectations: 'calm',
  after_mistake: 'bounce',
  after_poor_result: 'bounce',
  lose_focus: 'focus',
  confidence_drops: 'confidence',
  coach_feedback: 'confidence',
  selection_uncertain: 'confidence',
  injury_return: 'confidence',
  low_motivation: 'routine',
};

// "Practise" is recognised from what the athlete actually did in the app
// after the path started: a finished tool (ToolReport.toolType), or for the
// routine chapter a saved/updated routine.
const PRACTISE_TOOL_TYPES = {
  calm: ['body_reset'],
  focus: ['mental_rep'],
  confidence: ['self_talk_builder'],
  routine: [], // a Routine saved or changed
  bounce: ['mental_rep', 'body_reset'],
  picture: ['visualization'],
};

// Steps an athlete can mark themselves. Practise and reflect are recognised
// from their activity (and practise can also be marked, e.g. when a routine
// was built before the path started).
const SELF_MARKED_STEPS = new Set(['learn', 'practise', 'play']);
const PLAY_OUTCOMES = new Set(['helped', 'tried']);

// Play plan (Hook fix 3): the moments an athlete can pick at the end of a
// practice. The words live in the client; `cue` is their own cue word or
// routine name (max 60 chars, safety-screened).
const PLAN_MOMENTS = {
  reset: ['before_start', 'after_mistake', 'big_moment'],
  rep: ['after_miss', 'before_each', 'tight'],
  ritual: ['next_training', 'next_match'],
};
const PLAN_NOTES = {
  reset: { before_start: 'before they start: 3 slow breaths with a long out-breath', after_mistake: 'after a mistake: one long out-breath, then reset their feet', big_moment: 'in a big moment: a long out-breath before they go' },
  rep: { after_miss: 'after a miss: say their cue word "{cue}" and focus on the next one', before_each: 'before each play: say their cue word "{cue}"', tight: 'when they feel tight: say "{cue}" and breathe out' },
  ritual: { next_training: 'at their next training: run their routine "{cue}"', next_match: 'at their next match: run their routine "{cue}"' },
};

// Next match (Hook fix 2): how the athlete says the match went.
const MATCH_FEELS = new Set(['well', 'mixed', 'tough']);
// What kind of match is coming (founder, Nov 2026).
const MATCH_TYPES = new Set(['practice', 'league', 'tournament', 'selection', 'final']);
const MATCH_TYPE_NOTES = { practice: 'a practice match', league: 'a league match', tournament: 'a tournament', selection: 'a selection trial', final: 'a final or big game' };
const MATCH_USED = new Set(['helped', 'tried', 'forgot']);
// Plain names for Coach's internal note only (athlete copy lives in the client).
const CHAPTER_NOTES = {
  calm: { name: 'Calm body', skill: 'calming the body under pressure (Pressure Reset breathing)', practise: 'a Pressure Reset' },
  focus: { name: 'Focus', skill: 'bringing attention back with a cue word', practise: 'a Quick Rep with a cue word' },
  confidence: { name: 'Confidence', skill: 'replacing a pressure thought with their own Focus Card words', practise: 'building a Focus Card' },
  routine: { name: 'Same every time', skill: 'a short routine before and between moments', practise: 'building a Ritual routine' },
  bounce: { name: 'Bounce back', skill: 'the 5-second reset after a mistake', practise: 'a Quick Rep reset' },
  picture: { name: 'Picture it', skill: 'seeing the next performance going well (visualisation)', practise: 'a visualisation' },
};
const STEP_NOTES = {
  learn: 'read the 2-minute lesson',
  practise: 'practise it once in the app',
  play: 'use it in a real match or training',
  reflect: 'write a short Mind Journal reflection on how it went',
};

function chapterOrderFor(priorityId) {
  const first = PRIORITY_TO_CHAPTER[priorityId] || 'calm';
  return [first, ...CHAPTERS.filter(c => c !== first)];
}

module.exports = {
  LEVELS, levelKey, parseLevelKey, PLAN_MOMENTS, PLAN_NOTES, MATCH_FEELS, MATCH_TYPES, MATCH_TYPE_NOTES, MATCH_USED, CHAPTER_NOTES, STEP_NOTES, CHAPTERS, STEPS, PRIORITY_TO_CHAPTER, PRACTISE_TOOL_TYPES, SELF_MARKED_STEPS, PLAY_OUTCOMES, chapterOrderFor };
