// Deterministic safety phrase rules — the conservative floor beneath the
// prompt-level (LLM) safety layer, which remains in place as the second
// defensive layer for indirect or contextual distress these rules can't see.
//
// Design rules:
// - PHRASES, not single ambiguous words ("die", "jaan", "blood" alone never
//   match — sports talk is full of them: "sudden death", "killed it",
//   "dead tired", "jaan laga di").
// - Latin phrases match on word boundaries against normalized (lowercased)
//   text. Devanagari phrases use substring matching: \b is ASCII-only in JS
//   and unreliable for Devanagari, and these multi-word phrases are
//   distinctive enough not to need it.
// - Breathing-distress phrases are NOT screened as bare/standalone matches.
//   "I feel like I can't breathe before matches" is the single most common
//   way athletes describe pre-match nerves, so a rule firing on "can't
//   breathe" alone would misfire constantly. Instead, breathing emergencies
//   use a bounded CONTEXTUAL rule (see CONTEXTUAL_RULES below): it requires
//   a breathing-distress phrase together with an immediacy or danger-context
//   phrase in the same text (e.g. "right now", "hit in the chest", "feel
//   faint") — never a single isolated "breathe" token. Plain anxiety-framed
//   or figurative mentions ("struggle to breathe before matches", "took my
//   breath away") still fall to the prompt layer, which can read full
//   context.
// - Matching text is never returned to callers and never persisted.

// Each simple rule: { category, riskLevel, script, pattern }
// script: 'latin' → regex with word boundaries; 'devanagari' → substring.
//
// Each contextual rule: { category, riskLevel, anyOf: [...], withAnyOf: [...] }
// Fires only when at least one entry from BOTH groups matches — bounded
// phrase + context, never a single isolated token.

function latin(phrase) {
  // Escape regex specials, allow flexible whitespace between words,
  // and require word boundaries at both ends.
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'u');
}

function matchesAnyOf(text, group) {
  return group.some(({ script, pattern }) =>
    script === 'devanagari' ? text.includes(pattern) : pattern.test(text)
  );
}

const RULES = [
  // ── 1. Crisis / self-harm ──────────────────────────────────────────────
  // English
  ...[
    'kill myself', 'killing myself', 'want to die', 'wanted to die',
    'end my life', 'ending my life', 'suicide', 'suicidal',
    'self-harm', 'self harm', 'harm myself', 'harming myself',
    'hurt myself', 'hurting myself', 'cut myself', 'cutting myself',
    'want to disappear', 'not worth living', 'no reason to live',
    'rather be dead', 'wish i was dead', 'wish i were dead',
    'end it all', 'better off without me',
  ].map(p => ({ category: 'crisis', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Romanized Hindi / Hinglish
  ...[
    'marna chahta', 'marna chahti', 'mar jana chahta', 'mar jana chahti',
    'jeena nahi chahta', 'jeena nahi chahti', 'jeena nahin chahta', 'jeena nahin chahti',
    'khud ko chot', 'khud ko hurt', 'khud ko nuksan',
    'khudkushi', 'aatmahatya', 'atmahatya',
    'zindagi khatam kar', 'jindagi khatam kar',
    'apni jaan de dunga', 'apni jaan de dungi', 'jaan dena chahta', 'jaan dena chahti',
  ].map(p => ({ category: 'crisis', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Devanagari Hindi
  ...[
    'मरना चाहता', 'मरना चाहती', 'मर जाना चाहता', 'मर जाना चाहती',
    'जीना नहीं चाहता', 'जीना नहीं चाहती',
    'खुद को चोट', 'खुद को नुकसान',
    'खुदकुशी', 'आत्महत्या',
    'ज़िंदगी खत्म कर', 'जिंदगी खत्म कर',
    'अपनी जान दे', 'जान देना चाहता', 'जान देना चाहती',
  ].map(p => ({ category: 'crisis', riskLevel: 'high', script: 'devanagari', pattern: p })),

  // ── 2. Abuse / exploitation / coercion / unsafe contact ───────────────
  // English
  ...[
    'being abused', 'abuses me', 'abusing me', 'sexual abuse', 'sexually abused',
    'molested', 'molests me', 'touches me inappropriately', 'touched me inappropriately',
    'coach hits me', 'coach hit me', 'coach beats me', 'coach beat me',
    'parent hits me', 'father hits me', 'mother hits me', 'hits me at home',
    'beats me at home', 'being bullied', 'bullying me', 'bullies me',
    'threatened me', 'threatens me', 'blackmailing me', 'blackmails me',
    'scared to go home', 'afraid to go home', 'unsafe at home',
    'someone is hurting me', 'someone hurting me',
  ].map(p => ({ category: 'abuse', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Romanized Hindi / Hinglish
  ...[
    'mujhe maarta hai', 'mujhe maarte hain', 'mujhe maarti hai',
    'mujhe peetta hai', 'mujhe peette hain', 'mujhe pitta hai',
    'ghar par maarte', 'ghar pe maarte',
    'dhamki deta hai', 'dhamki dete hain', 'dhamki di hai',
    'galat tarah se chhuta', 'galat jagah chhuta', 'galat tareeke se chhuta',
    'ghar jaane se darr', 'ghar jane se darr', 'ghar mein unsafe', 'ghar me unsafe',
  ].map(p => ({ category: 'abuse', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Devanagari Hindi
  ...[
    'मुझे मारता है', 'मुझे मारते हैं', 'मुझे मारती है',
    'मुझे पीटता है', 'मुझे पीटते हैं',
    'घर पर मारते', 'घर पे मारते',
    'धमकी देता है', 'धमकी देते हैं', 'धमकी दी है',
    'गलत तरह से छूता', 'गलत जगह छूता', 'गलत तरीके से छूता',
    'घर जाने से डर', 'घर में असुरक्षित',
  ].map(p => ({ category: 'abuse', riskLevel: 'high', script: 'devanagari', pattern: p })),

  // ── 3. Urgent physical injury / immediate medical danger ──────────────
  // English
  ...[
    'concussion', 'passed out', 'unconscious', 'blacked out', 'fainted',
    'head injury', 'hit my head', 'neck injury', 'spine injury', 'injured my spine',
    'chest pain', 'bleeding heavily', 'bleeding a lot', 'bleeding badly',
    'bone is sticking', 'can\'t feel my legs', 'cannot feel my legs',
    'can\'t feel my arm', 'cannot feel my arm',
    'vomiting after hitting', 'vomited after hitting', 'seeing double',
  ].map(p => ({ category: 'injury', riskLevel: 'medium', script: 'latin', pattern: latin(p) })),
  // Romanized Hindi / Hinglish
  ...[
    'behosh ho gaya', 'behosh ho gayi', 'behosh hua',
    'sir mein chot', 'sir me chot', 'sar mein chot', 'sar me chot',
    'gardan mein chot', 'gardan me chot',
    'bahut khoon', 'khoon beh raha', 'khoon nikal raha',
    'chaati mein dard', 'chati me dard', 'seene mein dard', 'seene me dard',
    'hosh kho diya', 'hosh chala gaya',
  ].map(p => ({ category: 'injury', riskLevel: 'medium', script: 'latin', pattern: latin(p) })),
  // Devanagari Hindi
  ...[
    'बेहोश हो गया', 'बेहोश हो गई', 'बेहोश हुआ',
    'सिर में चोट', 'सर में चोट',
    'गर्दन में चोट', 'रीढ़ में चोट',
    'बहुत खून', 'खून बह रहा', 'खून निकल रहा',
    'छाती में दर्द', 'सीने में दर्द',
    'होश खो दिया', 'होश चला गया',
  ].map(p => ({ category: 'injury', riskLevel: 'medium', script: 'devanagari', pattern: p })),
];

// ── Contextual: urgent current breathing emergency ────────────────────────
// Fires ONLY when a breathing-distress phrase co-occurs with an immediacy
// or danger-context phrase in the same text. Neither group alone triggers
// anything — this is what keeps "struggle to breathe before matches" (pure
// anxiety framing, no immediacy/danger marker) and "took my breath away"
// (figurative, matches neither group) safely unflagged, while catching
// "I can't breathe right now", "hit in the chest and can't breathe", and
// "struggling to breathe and feel faint".

const BREATHING_DISTRESS = [
  // English
  { script: 'latin', pattern: latin("can't breathe") },
  { script: 'latin', pattern: latin('cannot breathe') },
  { script: 'latin', pattern: latin('can not breathe') },
  { script: 'latin', pattern: latin('struggling to breathe') },
  { script: 'latin', pattern: latin('trouble breathing') },
  { script: 'latin', pattern: latin('difficulty breathing') },
  { script: 'latin', pattern: latin('hard to breathe') },
  // Romanized Hindi / Hinglish
  { script: 'latin', pattern: latin('saans nahi aa raha') },
  { script: 'latin', pattern: latin('saans nahi aa rahi') },
  { script: 'latin', pattern: latin('saans nahi le pa raha') },
  { script: 'latin', pattern: latin('saans nahi le pa rahi') },
  { script: 'latin', pattern: latin('saans lene mein taklif') },
  { script: 'latin', pattern: latin('saans lene me taklif') },
  // Devanagari Hindi
  { script: 'devanagari', pattern: 'सांस नहीं आ रहा' },
  { script: 'devanagari', pattern: 'सांस नहीं आ रही' },
  { script: 'devanagari', pattern: 'सांस लेने में तकलीफ' },
];

const IMMEDIACY_OR_DANGER_CONTEXT = [
  // English
  { script: 'latin', pattern: latin('right now') },
  { script: 'latin', pattern: latin('just now') },
  { script: 'latin', pattern: latin('hit in the chest') },
  { script: 'latin', pattern: latin('hit my chest') },
  { script: 'latin', pattern: latin('feel faint') },
  { script: 'latin', pattern: latin('feeling faint') },
  { script: 'latin', pattern: latin('about to faint') },
  { script: 'latin', pattern: latin('chest hurts') },
  { script: 'latin', pattern: latin('chest is hurting') },
  // Romanized Hindi / Hinglish
  { script: 'latin', pattern: latin('abhi is waqt') },
  { script: 'latin', pattern: latin('abhi') },
  { script: 'latin', pattern: latin('chest mein laga') },
  { script: 'latin', pattern: latin('seene mein laga') },
  { script: 'latin', pattern: latin('chakkar aa raha') },
  { script: 'latin', pattern: latin('chakkar aa rahi') },
  { script: 'latin', pattern: latin('behosh jaisa') },
  // Devanagari Hindi
  { script: 'devanagari', pattern: 'अभी' },
  { script: 'devanagari', pattern: 'छाती में लगा' },
  { script: 'devanagari', pattern: 'सीने में लगा' },
  { script: 'devanagari', pattern: 'चक्कर आ रहा' },
  { script: 'devanagari', pattern: 'चक्कर आ रही' },
];

const CONTEXTUAL_RULES = [
  {
    category: 'injury',
    riskLevel: 'high',
    anyOf: BREATHING_DISTRESS,
    withAnyOf: IMMEDIACY_OR_DANGER_CONTEXT,
  },
];

module.exports = { RULES, CONTEXTUAL_RULES, matchesAnyOf };
