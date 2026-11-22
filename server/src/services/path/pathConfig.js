// Learning path — the chapters and how each step is recognised
// (docs/PATH-STRATEGY.md). Words for athletes live in the client
// (translations `path`); this file holds only keys and rules.

const CHAPTERS = ['calm', 'focus', 'confidence', 'routine', 'bounce', 'picture'];
const STEPS = ['learn', 'practise', 'play', 'reflect'];

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

// Next match (Hook fix 2): how the athlete says the match went.
const MATCH_FEELS = new Set(['well', 'mixed', 'tough']);
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
  MATCH_FEELS, MATCH_USED, CHAPTER_NOTES, STEP_NOTES, CHAPTERS, STEPS, PRIORITY_TO_CHAPTER, PRACTISE_TOOL_TYPES, SELF_MARKED_STEPS, PLAY_OUTCOMES, chapterOrderFor };
