// Fixed state vocabulary for the score-free Mind Journal. Deliberately flat
// and non-judgmental — no good/bad, high/low, or successful/unsuccessful
// grouping, and no numeric weight of any kind attached to any key.

const STATE_KEYS = [
  'calm',
  'focused',
  'confident',
  'motivated',
  'nervous',
  'frustrated',
  'distracted',
  'tired',
];

const STATE_LABELS = {
  calm:       { en: 'Calm',       hi: 'शांत' },
  focused:    { en: 'Focused',    hi: 'केंद्रित' },
  confident:  { en: 'Confident',  hi: 'आत्मविश्वासी' },
  motivated:  { en: 'Motivated',  hi: 'प्रेरित' },
  nervous:    { en: 'Nervous',    hi: 'घबराया हुआ' },
  frustrated: { en: 'Frustrated', hi: 'निराश' },
  distracted: { en: 'Distracted', hi: 'भटका हुआ' },
  tired:      { en: 'Tired',      hi: 'थका हुआ' },
};

// The unified reflection makes Q3 a required question, so it needs a real
// way to say "I don't know" — the same escape Q4 and Q5 already offer. It is
// deliberately NOT added to STATE_KEYS: Quick Note and the guided reflection
// keep the original eight exactly as they were.
const REFLECTION_STATE_KEYS = [...STATE_KEYS, 'not_sure'];

module.exports = { STATE_KEYS, STATE_LABELS, REFLECTION_STATE_KEYS };
