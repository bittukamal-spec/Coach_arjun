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

module.exports = { STATE_KEYS, STATE_LABELS };
